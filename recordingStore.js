/**
 * Grabación en disco por trozos que sobreviven a un cierre (CAM-TSK-0095).
 *
 * En OPFS, lo escrito con createWritable no existe hasta close(): un único
 * fichero abierto toda la sesión se perdía entero si el navegador se cerraba.
 * Cada sesión es una carpeta recordings/rec-<inicio>/ con meta.json y trozos
 * numerados que se cierran al escribirlos, así que quedan confirmados. Al
 * terminar, new Blob(trozos) los une sin copiarlos a memoria.
 */

const RECORDINGS_DIR = 'recordings';
const META = 'meta.json';
const DONE = 'done'; // marca de sesión terminada (ya descargada)
const PART_PREFIX = 'part-';
const partName = index => `${PART_PREFIX}${String(index).padStart(6, '0')}`;

async function writeFile(dir, name, data) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close(); // aquí queda confirmado en disco
}

async function hasFile(dir, name) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (error) {
    if (error?.name === 'NotFoundError') return false;
    throw error;
  }
}

/** Une los trozos de una sesión, en orden, en un único Blob del tipo dado. */
async function joinParts(dir, type) {
  const parts = [];
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith(PART_PREFIX)) parts.push([name, await handle.getFile()]);
  }
  parts.sort(([a], [b]) => a.localeCompare(b));
  return new Blob(parts.map(([, file]) => file), { type });
}

// Antes de grabar: fuera las sesiones ya descargadas y los ficheros sueltos del
// formato anterior. Las que quedaron a medias se conservan para recuperarlas.
async function removeFinished(recordings) {
  const finished = [];
  for await (const [name, handle] of recordings.entries()) {
    if (handle.kind === 'file' || await hasFile(handle, DONE)) finished.push(name);
  }
  for (const name of finished) await recordings.removeEntry(name, { recursive: true });
}

async function readMeta(dir) {
  const file = await (await dir.getFileHandle(META)).getFile();
  return JSON.parse(await file.text());
}

export function createRecordingStore(getRoot = () => navigator.storage.getDirectory()) {
  const recordingsDir = async () => (await getRoot()).getDirectoryHandle(RECORDINGS_DIR, { create: true });

  return {
    /**
     * Sesiones que quedaron a medias (navegador cerrado o colgado), con su vídeo
     * para descargarlo. Al abrir la app no hay ninguna grabación en curso.
     */
    async pendingSessions() {
      const recordings = await recordingsDir();
      const pending = [];
      for await (const [id, dir] of recordings.entries()) {
        if (dir.kind !== 'directory' || await hasFile(dir, DONE)) continue;
        const { mimeType, startedAt } = await readMeta(dir);
        const video = () => joinParts(dir, mimeType);
        const { size } = await video();
        if (!size) continue; // empezó y no llegó a guardar nada
        pending.push({
          id, mimeType, startedAt, size, video,
          markDone: () => writeFile(dir, DONE, ''), // se borra al empezar otra grabación
          discard: () => recordings.removeEntry(id, { recursive: true }),
        });
      }
      return pending.toSorted((a, b) => b.startedAt - a.startedAt); // la más reciente primero
    },

    async startSession({ mimeType, startedAt }) {
      const recordings = await recordingsDir();
      await removeFinished(recordings);
      const id = `rec-${startedAt}`;
      const dir = await recordings.getDirectoryHandle(id, { create: true });
      await writeFile(dir, META, JSON.stringify({ mimeType, startedAt }));
      let next = 0;
      return {
        id,
        async append(blob) {
          await writeFile(dir, partName(next), blob);
          next += 1;
        },
        /** Marca la sesión como terminada y devuelve el vídeo completo. */
        async finish() {
          await writeFile(dir, DONE, '');
          return joinParts(dir, mimeType);
        },
      };
    },
  };
}
