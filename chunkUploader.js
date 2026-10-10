/**
 * Subida a una sesión resumable de Drive mientras se graba (CAM-TSK-0157):
 * bloques múltiplos de 256 KiB, en orden, con total desconocido (a-b/*). Con
 * cada 308 Drive dice cuánto confirmó y se sigue desde ahí; ante red, 429 o
 * 5xx se le pregunta y se reintenta con espera creciente. finish cierra.
 */

export const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_RETRIES = 6;
const retryable = status => status === 429 || status >= 500;
const confirmedBytes = response => {
  const range = response.headers.get('range'); // "bytes=0-1234"
  return range ? Number(range.split('-')[1]) + 1 : 0;
};

export function createChunkUploader({
  sessionUri,
  fetch = globalThis.fetch,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  chunkBytes = CHUNK_BYTES,
}) {
  let buffer = new Blob([]);
  let sent = 0; // bytes que Drive ha confirmado
  let queue = Promise.resolve();
  let failure = null;

  const put = (range, body) => fetch(sessionUri, { method: 'PUT', headers: { 'Content-Range': range }, body });

  /** Cuánto tiene Drive; si la subida ya terminó (respuesta perdida), el fichero. */
  async function askDrive() {
    try {
      const response = await put('bytes */*');
      if (response.ok) return { confirmed: sent, file: await response.json() };
      return { confirmed: response.status === 308 ? confirmedBytes(response) : sent, file: null };
    } catch {
      return { confirmed: sent, file: null }; // sin red: se reintenta desde lo último confirmado
    }
  }

  /** Sube data, que empieza en `sent`; total null mientras no se sepa. */
  async function upload(data, total) {
    const end = sent + data.size;
    const base = sent;
    let attempts = 0;
    /** Espera y pregunta a Drive; devuelve el fichero si ya estaba terminado. */
    const failOrRetry = async message => {
      attempts += 1;
      if (attempts > MAX_RETRIES) throw new Error(message);
      await wait(500 * 2 ** attempts);
      const state = await askDrive();
      sent = state.confirmed;
      return state.file;
    };
    for (;;) {
      if (total === null && sent >= end) return null; // bloque intermedio ya confirmado
      const rest = data.slice(sent - base);
      const range = rest.size ? `bytes ${sent}-${end - 1}/${total ?? '*'}` : `bytes */${total}`;
      const response = await put(range, rest).catch(() => null);
      if (response?.ok) return response.json();
      if (response?.status === 308) {
        const before = sent;
        sent = confirmedBytes(response);
        if (sent > before) {
          attempts = 0;
        } else {
          const file = await failOrRetry('Drive no avanza.');
          if (file) return file;
        }
      } else if (response && !retryable(response.status)) {
        throw new Error(`Drive respondió ${response.status}.`);
      } else {
        const file = await failOrRetry('Drive no responde.');
        if (file) return file;
      }
    }
  }

  const enqueue = task => {
    queue = queue.then(() => (failure ? undefined : task())).catch(error => { failure = error; });
  };

  return {
    /** Añade un trozo; si ya hay bloques completos, se suben en segundo plano. */
    append(blob) {
      buffer = new Blob([buffer, blob]);
      const cut = Math.floor(buffer.size / chunkBytes) * chunkBytes;
      if (!cut) return;
      const part = buffer.slice(0, cut);
      buffer = buffer.slice(cut);
      enqueue(() => upload(part, null));
    },
    /** Sube lo que queda con el tamaño total; devuelve el fichero de Drive. */
    async finish() {
      await queue;
      if (failure) throw failure;
      const last = buffer;
      buffer = new Blob([]);
      return upload(last, sent + last.size);
    },
    progress: () => ({ sent, buffered: buffer.size }),
  };
}
