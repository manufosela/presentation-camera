/**
 * Grabación de la sesión (slides + cara) mediante captura de pantalla/pestaña.
 *
 * El HTML local se muestra en un iframe y las presentaciones remotas son
 * cross-origin: ninguno es capturable por canvas, así que la única vía para
 * grabar lo que se ve (slides + overlay de webcam) es getDisplayMedia(). Exige
 * un gesto del usuario y el selector del navegador (limitación de seguridad).
 * Ver ADR "Estrategia dual de grabación" (CAM-TSK-0004).
 */

import { t } from './i18n.js';
import { createRecordingStore } from './recordingStore.js';
import { withWebmDuration } from './webmDuration.js';
import { createRecordingClock } from './recordingClock.js';

// MP4 primero (CAM-TSK-0096): es lo que cualquiera sabe abrir y subir. Con AAC
// es lo más compatible (macOS, Windows); donde Chrome no codifica AAC (Linux),
// MP4 con Opus; si el navegador no graba MP4, WebM como antes.
const MIME_PREFERENCES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
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

// Cada cuánto entrega MediaRecorder un trozo; cada trozo se guarda confirmado
// en disco (recordingStore.js), así que es lo máximo que se pierde si se cierra.
const SLICE_MS = 5000;

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
  beforeStart = async () => {}, // tras aceptar la captura, antes de grabar (cuenta atrás)
} = {}) {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error(t('error.noScreenCapture'));
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

  // A disco por trozos confirmados (recuperables si se cierra); sin OPFS, en memoria.
  const type = recorder.mimeType || mimeType || 'video/webm';
  const startedAt = Date.now();
  const clock = createRecordingClock(); // duración sin pausas (CAM-TSK-0098)
  const chunks = [];
  let session = null;
  let writeChain = Promise.resolve();
  if (navigator.storage?.getDirectory) {
    try {
      session = await createRecordingStore().startSession({ mimeType: type, startedAt });
    } catch (error) {
      console.warn('[rec] sin OPFS: la grabación va a memoria', error);
      session = null;
    }
  }

  recorder.addEventListener('dataavailable', event => {
    if (!event.data || !event.data.size) return;
    if (session) {
      writeChain = writeChain
        .then(() => session.append(event.data))
        .catch(error => onError?.(error));
    } else {
      chunks.push(event.data);
    }
  });
  const releaseInputs = () => {
    for (const s of [displayStream, micStream]) {
      s?.getTracks().forEach(track => track.stop());
    }
    audioCtx?.close?.();
  };
  recorder.addEventListener('stop', async () => {
    releaseInputs();
    if (session) {
      try {
        await writeChain;
        onStop?.(await session.finish(clock.elapsed()), type); // une los trozos sin copiarlos al heap
      } catch (error) {
        onError?.(error);
      }
    } else {
      onStop?.(await withWebmDuration(new Blob(chunks, { type }), clock.elapsed()), type);
    }
  });
  recorder.addEventListener('error', event => {
    onError?.(event.error || new Error(t('error.recording')));
  });

  // Si el usuario detiene la captura desde la barra "Estás compartiendo…".
  displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (recorder.state !== 'inactive') recorder.stop();
  });

  // Cuenta atrás: si falla o se deja de compartir mientras tanto, no se graba y
  // se suelta todo lo capturado (micrófono incluido).
  try {
    await beforeStart();
  } catch (error) {
    releaseInputs();
    throw error;
  }
  if (displayStream.getVideoTracks()[0]?.readyState === 'ended') {
    releaseInputs();
    throw new Error(t('recording.notStarted'));
  }
  recorder.start(SLICE_MS);
  clock.start();

  return {
    stop() {
      clock.pause(); // la duración se fija al parar
      if (recorder.state !== 'inactive') recorder.stop();
    },
    pause() {
      if (recorder.state !== 'recording') return;
      recorder.pause();
      clock.pause();
    },
    resume() {
      if (recorder.state !== 'paused') return;
      recorder.resume();
      clock.resume();
    },
    get paused() { return recorder.state === 'paused'; },
    elapsed: () => clock.elapsed(),
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
