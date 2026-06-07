/**
 * Grabación de la sesión (slides + cara) mediante captura de pantalla/pestaña.
 *
 * El HTML local se muestra en un iframe y las presentaciones remotas son
 * cross-origin: ninguno es capturable por canvas, así que la única vía para
 * grabar lo que se ve (slides + overlay de webcam) es getDisplayMedia(). Exige
 * un gesto del usuario y el selector del navegador (limitación de seguridad).
 * Ver ADR "Estrategia dual de grabación" (CAM-TSK-0004).
 */

const MIME_PREFERENCES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

/** Devuelve el primer mimeType soportado por MediaRecorder, o '' si ninguno. */
export function pickSupportedMimeType(candidates = MIME_PREFERENCES) {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
}

/** Extensión de fichero a partir del mimeType. */
export function extFromMime(mimeType) {
  return typeof mimeType === 'string' && mimeType.includes('mp4') ? 'mp4' : 'webm';
}

/** Nombre de fichero: presentation-YYYY-MM-DD_HH-mm-ss.ext */
export function buildRecordingFilename(date = new Date(), ext = 'webm') {
  const p = n => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
    + `_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
  return `presentation-${stamp}.${ext}`;
}

/**
 * Estima el espacio disponible y la duración máxima de grabación.
 * navigator.storage.estimate() devuelve la cuota del ORIGIN (OPFS), no el disco
 * físico; por eso es una estimación (a disco real el límite sería el volumen).
 */
export async function estimateStorage(bitrateMbps = 6) {
  const bytesPerHour = (bitrateMbps * 1_000_000 / 8) * 3600;
  let quota = 0;
  let usage = 0;
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    quota = est.quota ?? 0;
    usage = est.usage ?? 0;
  }
  const free = Math.max(0, quota - usage);
  return {
    quotaBytes: quota,
    freeBytes: free,
    gbPerHour: bytesPerHour / 1e9,
    maxHours: bytesPerHour > 0 ? free / bytesPerHour : 0,
  };
}

const RECORDINGS_DIR = 'recordings';

async function getRecordingsDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(RECORDINGS_DIR, { create: true });
}

// Borra grabaciones temporales previas para no acumular cuota OPFS. Se llama al
// iniciar una nueva grabación (la última queda disponible para recuperación).
async function cleanupOldRecordings(dir) {
  const names = [];
  for await (const [name] of dir.entries()) names.push(name);
  for (const name of names) {
    try { await dir.removeEntry(name); } catch { /* en uso o ya borrado */ }
  }
}

/**
 * Inicia una grabación de pantalla/pestaña con audio mezclado (micrófono +
 * sistema). Devuelve un controlador { stop, state, mimeType }. onStop recibe el
 * fichero/Blob final; onError, los fallos. Lanza si el usuario cancela el
 * selector o no hay soporte (el caller lo traduce a un aviso).
 *
 * Si OPFS está disponible, los chunks se escriben a disco (OPFS) de forma
 * incremental para no acumular la grabación en RAM y poder recuperar parciales;
 * si no, se acumulan en memoria como fallback.
 */
export async function startScreenRecording({
  withMic = true,
  withSystemAudio = true,
  onStop,
  onError,
} = {}) {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Tu navegador no permite capturar la pantalla para grabar.');
  }
  const displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: withSystemAudio,
    preferCurrentTab: true,
  });

  const tracks = [...displayStream.getVideoTracks()];
  const audioInputs = [];
  let micStream = null;

  if (withSystemAudio && displayStream.getAudioTracks().length) {
    audioInputs.push(new MediaStream(displayStream.getAudioTracks()));
  }
  if (withMic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioInputs.push(micStream);
    } catch {
      // Sin permiso de micrófono: grabamos sin su pista, sin romper.
    }
  }

  let audioCtx = null;
  if (audioInputs.length === 1) {
    tracks.push(...audioInputs[0].getAudioTracks());
  } else if (audioInputs.length > 1) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioCtx();
    const dest = audioCtx.createMediaStreamDestination();
    for (const s of audioInputs) audioCtx.createMediaStreamSource(s).connect(dest);
    tracks.push(...dest.stream.getAudioTracks());
  }

  const mixStream = new MediaStream(tracks);
  const mimeType = pickSupportedMimeType();
  const recorder = new MediaRecorder(mixStream, mimeType ? { mimeType } : undefined);
  const ext = extFromMime(mimeType);

  // Intentar escritura incremental a OPFS; si no, fallback en memoria.
  const chunks = [];
  let opfsHandle = null;
  let opfsDir = null;
  let writable = null;
  let writeChain = Promise.resolve();
  if (navigator.storage?.getDirectory) {
    try {
      opfsDir = await getRecordingsDir();
      await cleanupOldRecordings(opfsDir);
      opfsHandle = await opfsDir.getFileHandle(`rec-${Date.now()}.${ext}`, { create: true });
      writable = await opfsHandle.createWritable();
    } catch {
      writable = null; // sin OPFS utilizable: fallback en memoria
    }
  }

  recorder.addEventListener('dataavailable', event => {
    if (!event.data || !event.data.size) return;
    if (writable) {
      writeChain = writeChain
        .then(() => writable.write(event.data))
        .catch(error => onError?.(error));
    } else {
      chunks.push(event.data);
    }
  });
  recorder.addEventListener('stop', async () => {
    for (const s of [displayStream, micStream]) {
      s?.getTracks().forEach(track => track.stop());
    }
    audioCtx?.close?.();
    const type = recorder.mimeType || mimeType || 'video/webm';
    if (writable) {
      try {
        await writeChain;
        await writable.close();
        const file = await opfsHandle.getFile(); // referencia el contenido sin copiarlo al heap
        onStop?.(file, type);
      } catch (error) {
        onError?.(error);
      }
    } else {
      onStop?.(new Blob(chunks, { type }), type);
    }
  });
  recorder.addEventListener('error', event => {
    onError?.(event.error || new Error('Error de grabación.'));
  });

  // Si el usuario detiene la captura desde la barra "Estás compartiendo…".
  displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (recorder.state !== 'inactive') recorder.stop();
  });

  recorder.start(1000); // chunks periódicos (clave para escritura incremental futura)

  return {
    stop() { if (recorder.state !== 'inactive') recorder.stop(); },
    get state() { return recorder.state; },
    mimeType: recorder.mimeType || mimeType,
  };
}

/** Descarga un Blob como fichero. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
