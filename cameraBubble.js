/**
 * Burbuja de cámara flotante (CAM-TSK-0164): una ventana Document
 * Picture-in-Picture que queda encima de cualquier aplicación, así que sale en
 * la grabación de la pantalla entera y el ponente se ve mientras hace la demo.
 * Lleva los botones de grabar, pausar y parar: un clic dentro de la burbuja
 * también da permiso a la ventana de onslide para abrir el selector de pantalla.
 * La burbuja se queda con la cámara: al cerrarse, la suelta.
 */

import { t } from './i18n.js';
import { createFrameLoop } from './webcamLoop.js';

const ACTIONS = ['record', 'pause', 'stop'];
// La ventana sigue al tamaño de la cámara (CAM-BUG-0031): la burbuja más los botones.
const WINDOW_SIZES = {
  s: { width: 180, height: 240 },
  m: { width: 240, height: 300 },
  l: { width: 320, height: 380 },
};

// Silueta (CAM-BUG-0031): el recorte se dibuja en un canvas con el rAF de la
// propia burbuja, que sigue en marcha cuando onslide queda detrás y frena el suyo.
// Si el recorte no se puede preparar, se ve la cámara tal cual y se avisa.
function startCutout({ win, video, createCutout, isClosed, onError }) {
  const canvas = win.document.createElement('canvas');
  canvas.className = 'bubble-camera';
  video.hidden = true;
  let renderer = null;
  const loop = createFrameLoop({
    step: () => {
      if (isClosed()) return false;
      if (video.videoWidth && video.videoHeight) renderer.drawFrame();
      return true;
    },
    requestFrame: callback => win.requestAnimationFrame(callback),
    cancelFrame: id => win.cancelAnimationFrame(id),
  });
  (async () => createCutout(video, canvas))()
    .then(created => {
      renderer = created;
      if (!isClosed()) loop.start();
    })
    .catch(error => {
      canvas.remove();
      video.hidden = false;
      onError(error);
    });
  win.addEventListener('pagehide', () => loop.stop());
  return canvas;
}

function createButton(doc, action, onClick) {
  const element = doc.createElement('button');
  element.type = 'button';
  element.dataset.action = action;
  element.className = `bubble-btn bubble-${action}`;
  element.addEventListener('click', onClick);
  return element;
}

export async function openCameraBubble({
  pip = globalThis.documentPictureInPicture,
  camera = null, // o luego con showCamera: el permiso de cámara puede tardar más que el del clic
  size = 'm',
  withCamera = true, // false con «Sin cámara»: solo los botones
  createCutout = null, // (video, canvas) => renderer con drawFrame(): la silueta
  styleHref,
  onRecord,
  onPause,
  onStop,
  onClose = () => {},
  onError = () => {},
}) {
  if (typeof pip?.requestWindow !== 'function') throw new Error(t('bubble.unsupported'));
  if (!Object.hasOwn(WINDOW_SIZES, size)) throw new Error(`Tamaño de cámara desconocido: ${size}`);
  const win = await pip.requestWindow({ ...WINDOW_SIZES[size] });
  const doc = win.document;
  doc.title = t('bubble.title');

  const style = doc.createElement('link');
  style.rel = 'stylesheet';
  style.href = styleHref;
  doc.head.append(style);

  const video = doc.createElement('video');
  video.className = 'bubble-camera';
  Object.assign(video, { autoplay: true, muted: true, playsInline: true });
  let current = null;
  const showCamera = stream => {
    current = stream;
    video.srcObject = stream;
    // Con la silueta el vídeo va oculto y Chrome no reproduce solo un vídeo
    // oculto: sin play() no habría frames que recortar.
    video.play().catch(error => console.error(error));
  };
  if (camera) showCamera(camera);
  let closed = false;
  const view = withCamera ? [video] : [];
  if (withCamera && createCutout) {
    view.push(startCutout({ win, video, createCutout, isClosed: () => closed, onError }));
  }

  const handlers = { record: onRecord, pause: onPause, stop: onStop };
  const buttons = Object.fromEntries(ACTIONS.map(action => [action, createButton(doc, action, () => handlers[action]())]));
  const controls = doc.createElement('div');
  controls.className = 'bubble-controls';
  controls.append(...ACTIONS.map(action => buttons[action]));
  doc.body.append(...view, controls);

  // 'idle' | 'recording' | 'paused'
  function setState(state) {
    const idle = state === 'idle';
    buttons.record.hidden = !idle;
    buttons.pause.hidden = idle;
    buttons.stop.hidden = idle;
    buttons.record.textContent = t('rec.start');
    buttons.pause.textContent = t(state === 'paused' ? 'rec.resume' : 'rec.pause');
    buttons.stop.textContent = t('rec.stop');
  }
  setState('idle');

  win.addEventListener('pagehide', () => { // la cierra la app o el usuario
    if (closed) return;
    closed = true;
    for (const track of current?.getTracks() ?? []) track.stop();
    onClose();
  });

  return { setState, showCamera, close: () => win.close() };
}
