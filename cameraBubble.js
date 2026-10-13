/**
 * Burbuja de cámara flotante (CAM-TSK-0164): una ventana Document
 * Picture-in-Picture que queda encima de cualquier aplicación, así que sale en
 * la grabación de la pantalla entera y el ponente se ve mientras hace la demo.
 * Lleva los botones de grabar, pausar y parar: un clic dentro de la burbuja
 * también da permiso a la ventana de onslide para abrir el selector de pantalla.
 * La burbuja se queda con la cámara: al cerrarse, la suelta.
 */

import { t } from './i18n.js';

const ACTIONS = ['record', 'pause', 'stop'];

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
  camera,
  styleHref,
  onRecord,
  onPause,
  onStop,
  onClose = () => {},
}) {
  if (typeof pip?.requestWindow !== 'function') throw new Error(t('bubble.unsupported'));
  const win = await pip.requestWindow({ width: 240, height: 300 });
  const doc = win.document;
  doc.title = t('bubble.title');

  const style = doc.createElement('link');
  style.rel = 'stylesheet';
  style.href = styleHref;
  doc.head.append(style);

  const video = doc.createElement('video');
  video.className = 'bubble-camera';
  Object.assign(video, { autoplay: true, muted: true, playsInline: true, srcObject: camera });

  const handlers = { record: onRecord, pause: onPause, stop: onStop };
  const buttons = Object.fromEntries(ACTIONS.map(action => [action, createButton(doc, action, () => handlers[action]())]));
  const controls = doc.createElement('div');
  controls.className = 'bubble-controls';
  controls.append(...ACTIONS.map(action => buttons[action]));
  doc.body.append(video, controls);

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

  let closed = false;
  win.addEventListener('pagehide', () => { // la cierra la app o el usuario
    if (closed) return;
    closed = true;
    for (const track of camera.getTracks()) track.stop();
    onClose();
  });

  return { setState, close: () => win.close() };
}
