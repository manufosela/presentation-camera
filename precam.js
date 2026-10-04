import './frameGuard.js'; // primero: aborta si la app está dentro de un iframe
import { createSourcesStore, bindSourcesToChannel, MAX_SOURCES } from './sources.js';
import { saveHtml, saveBundle, readBundleFiles, readLocalHtml, removeHtml, removeBundle } from './localStore.js';
import { buildBundleBlobs } from './bundleBlobs.js';
import { bridgeRequestFromMessage, injectDeckBridge } from './deckBridge.js';
import { removedLocalFiles, sourceLabel } from './savedSources.js';
import { formatVersion, loadVersion } from './appVersion.js';
import { startScreenRecording, downloadBlob, buildRecordingFilename, extFromMime, estimateStorage } from './recorder.js';
import { deckCommandForKey, revealSlideFromMessage, sendDeckCommand } from './deckKeys.js';
import { notesAt, parseDeckNotes } from './deckNotes.js';
import { allowForSource, deckOrigin, sandboxForSource } from './frameSandbox.js';
import { createCutoutRenderer, createFrameLoop } from './webcamLoop.js';
import { createStreamSwitcher } from './streamSwitch.js';
import { loadBodyPixLibrary } from './segmentationLoader.js';
import { needsCanvasLoop } from './renderMode.js';
import {
  isDebugEnabled,
  loadCameraId,
  loadSingleKeyShortcuts,
  saveCameraId,
  saveSingleKeyShortcuts,
} from './appPrefs.js';
import { trapTabKey } from './focusTrap.js';
import { deriveSourceTitle, hostnameOf, sanitizePresentationUrl } from './urlUtils.js';
import { STORAGE_KEYS, SYNC_CHANNEL } from './constants.js';
import { sourceIndexForKey, startMainLink } from './linkChannel.js';
import {
  buildQuery,
  parseQuery,
  POSITIONS as positions,
  SIZES as sizes,
  STYLES as styles,
} from './queryState.js';

const sources = createSourcesStore();
const SOURCES_FULL_MESSAGE = `Ya tienes ${MAX_SOURCES} presentaciones guardadas, el máximo. Quita alguna con la ✕ en «Presentaciones guardadas», debajo de los botones de cargar.`;

// ─── BroadcastChannel hacia el panel de control ──────────────
// Canal compartido para sync de sources (sources:* messages) y para
// presencia (main:* / panel:*).
const syncChannel = new BroadcastChannel(SYNC_CHANNEL);
const sourcesBinding = bindSourcesToChannel(sources, syncChannel);

// Debug helper accesible desde la consola del navegador (solo con ?debug=1).
if (isDebugEnabled(window.location.search)) {
  window.__cam = { sources, channel: syncChannel, binding: sourcesBinding, role: 'main' };
}
const panelLink = startMainLink(syncChannel);
window.addEventListener('beforeunload', () => {
  try { panelLink.bye(); } catch { /* el canal puede estar ya cerrado */ }
});

const presentationSection = document.getElementById('presentationSection');
const iframeStack = document.getElementById('iframeStack');
const webcamSection = document.getElementById('webcamSection');
const canvas = document.getElementById('outputCanvas');
const video = document.getElementById('webcamVideo');
const statusMessage = document.getElementById('statusMessage');
const moveButton = document.getElementById('moveWebcamBtn');
const startButton = document.getElementById('startButton');
const exampleButton = document.getElementById('exampleButton');
const styleInputs = document.querySelectorAll('input[name="webcam-style"]');
const sizeInputs = document.querySelectorAll('input[name="webcam-size"]');
const urlInput = document.getElementById('url');
const positionInputs = document.querySelectorAll('input[name="position"]');
const homeButton = document.getElementById('homeButton');
const cameraSelect = document.getElementById('cameraSelect');
const cameraFieldset = document.getElementById('cameraFieldset');
const toggleStyleBtn = document.getElementById('toggleStyleBtn');
const liveBadge = document.getElementById('liveBadge');
const liveTime = document.getElementById('liveTime');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const topActions = document.getElementById('topActions');
const openPanelBtn = document.getElementById('openPanelBtn');
const loadLocalHtmlBtn = document.getElementById('loadLocalHtmlBtn');
const localHtmlInput = document.getElementById('localHtmlInput');
const loadLocalBundleBtn = document.getElementById('loadLocalBundleBtn');
const autoRecordInput = document.getElementById('autoRecordInput');
const recordBtn = document.getElementById('recordBtn');
const recordLabel = document.getElementById('recordLabel');
const recordEstimate = document.getElementById('recordEstimate');
const onboarding = document.getElementById('onboarding');
const onboardingClose = document.getElementById('onboardingClose');
const onboardingDone = document.getElementById('onboardingDone');
const helpBtn = document.getElementById('helpBtn');
const showChromeBtn = document.getElementById('showChromeBtn');
const ONBOARDED_KEY = STORAGE_KEYS.onboarded;
let chromeHidden = false; // controles de la app ocultos (para que no salgan en la grabación)

let panelWindow = null;
// blob URLs de sources HTML locales, cacheadas por id de source para no
// recrearlas en cada render. Se revocan al volver al setup.
const localBlobUrls = new Map();

// Grabación: controlador activo (null si no se está grabando) y preferencia de
// auto-grabación al pulsar Go live (por defecto activada, persistida).
const AUTO_RECORD_KEY = STORAGE_KEYS.autoRecord;
let recordingCtrl = null;
let autoRecordEnabled = loadAutoRecordPref();

// Atajos de una tecla desactivables (WCAG 2.1.4). Sin almacenamiento, activados.
const singleKeyShortcutsInput = document.getElementById('singleKeyShortcutsInput');
let singleKeyShortcuts = true;
try { singleKeyShortcuts = loadSingleKeyShortcuts(window.localStorage); } catch { /* noop */ }

// localStorage puede lanzar (modo privado, almacenamiento bloqueado): la cámara
// elegida es una comodidad, así que sin almacenamiento se usa la automática.
function readCameraId() {
  try { return loadCameraId(window.localStorage); } catch { return null; }
}

function persistCameraId(deviceId) {
  try { saveCameraId(window.localStorage, deviceId); } catch { /* noop */ }
}

function loadAutoRecordPref() {
  try {
    const raw = window.localStorage.getItem(AUTO_RECORD_KEY);
    return raw === null ? true : raw === 'true';
  } catch { return true; }
}

const SEGMENTATION_INTERVAL_MS = 50; // ~20 fps para BodyPix
let currentPositionIndex = 0;
let currentStyle = 'frame';
let stream;
let net;
let netPromise;
let bodyPix = null; // API de BodyPix, disponible tras la carga diferida
let renderer = null; // motor del recorte; se crea al tener el modelo cargado
// Bucle de dibujo del recorte (renderStep es una declaración de función, ya disponible).
const cameraLoop = createFrameLoop({
  step: renderStep,
  requestFrame: cb => requestAnimationFrame(cb),
  cancelFrame: id => cancelAnimationFrame(id),
});
// Cambios rápidos de cámara: solo la última petición gana; las que llegan tarde
// se paran (si no, la cámara quedaría encendida). requestVideoStream es una
// declaración de función, ya disponible.
const cameraRequests = createStreamSwitcher({
  request: () => requestVideoStream(),
  release: lateStream => lateStream.getTracks().forEach(track => track.stop()),
});
const NO_PERSON_MESSAGE ='No te detecto en modo recorte: mostrando la cámara completa. Revisa la luz o el encuadre.';
let noPersonNoticeShown = false;
let firstFrameDrawn = false;
let currentDeviceId = null;
let currentSize = 'm';
let liveTimerId = null;
let liveStartedAt = 0;

startButton.addEventListener('click', () => {
  startPresentation().catch(error => {
    console.error(error);
    showStatus(error.message || 'No se pudo iniciar la presentación.', true);
  });
});
exampleButton.addEventListener('click', () => {
  startPresentation('https://view.genially.com/609ceb5257230a0d5a132ffb/presentation-presentacion-antiguo-egipto-para-ninos').catch(error => {
    console.error(error);
    showStatus(error.message || 'No se pudo iniciar la presentación.', true);
  });
});
moveButton.addEventListener('click', event => {
  event.stopPropagation();
  cyclePosition(1);
});
toggleStyleBtn?.addEventListener('click', event => {
  event.stopPropagation();
  toggleStyle();
});
styleInputs.forEach(input => {
  input.addEventListener('change', event => {
    const requestedStyle = event.target.value;
    updateStyleClass(requestedStyle);
    persistState(urlInput.value.trim(), getSelectedPosition(), requestedStyle);
  });
});
positionInputs.forEach(input => {
  input.addEventListener('change', event => {
    const newPosition = event.target.value;
    updatePositionClass(newPosition);
    persistState(urlInput.value.trim(), newPosition, currentStyle);
  });
});
sizeInputs.forEach(input => {
  input.addEventListener('change', event => {
    updateSizeClass(event.target.value);
    persistState(urlInput.value.trim(), getSelectedPosition(), currentStyle);
  });
});
cameraSelect?.addEventListener('change', async event => {
  currentDeviceId = event.target.value || null;
  persistCameraId(currentDeviceId);
  persistState(urlInput.value.trim(), getSelectedPosition(), currentStyle);
  if (isPresentationActive()) {
    await startWebcam().catch(error => {
      console.error(error);
      showStatus(error.message || 'No se pudo cambiar de cámara.', true);
    });
  }
});
homeButton.addEventListener('click', returnToSetup);
fullscreenBtn?.addEventListener('click', toggleFullscreen);
openPanelBtn?.addEventListener('click', openControlPanel);
loadLocalHtmlBtn?.addEventListener('click', () => localHtmlInput?.click());
localHtmlInput?.addEventListener('change', handleLocalHtmlPick);
loadLocalBundleBtn?.addEventListener('click', handleLocalBundlePick);
helpBtn?.addEventListener('click', openOnboarding);
onboardingClose?.addEventListener('click', () => closeOnboarding());
onboardingDone?.addEventListener('click', () => closeOnboarding());
onboarding?.addEventListener('click', event => {
  if (event.target === onboarding) closeOnboarding(); // click en el fondo
});
onboarding?.addEventListener('keydown', event => trapTabKey(onboarding, event));
if (singleKeyShortcutsInput) {
  singleKeyShortcutsInput.checked = singleKeyShortcuts;
  singleKeyShortcutsInput.addEventListener('change', () => {
    singleKeyShortcuts = singleKeyShortcutsInput.checked;
    try { saveSingleKeyShortcuts(window.localStorage, singleKeyShortcuts); } catch { /* noop */ }
  });
}
if (autoRecordInput) {
  autoRecordInput.checked = autoRecordEnabled;
  autoRecordInput.addEventListener('change', () => {
    autoRecordEnabled = autoRecordInput.checked;
    try { window.localStorage.setItem(AUTO_RECORD_KEY, String(autoRecordEnabled)); } catch { /* noop */ }
  });
}
recordBtn?.addEventListener('click', toggleRecording);
showChromeBtn?.addEventListener('click', () => setChromeHidden(false));
document.addEventListener('fullscreenchange', syncFullscreenButton);
document.addEventListener('keydown', handleKeyboardShortcut);
document.addEventListener('keydown', handleGlobalShortcut);

// La principal mantiene un stack con un iframe por cada source. Solo
// el activo es visible; los demás siguen cargados (visibility:hidden)
// para conservar su estado interno (slide actual, zoom...).
let presentationActive = false;

sources.subscribe(({ list, activeIndex }) => {
  // En setup, reflejamos la URL activa en el input para que el botón
  // "Go live" tenga algo que arrancar.
  if (!isPresentationActive() && urlInput) {
    const active = list[activeIndex] ?? null;
    // Si la source activa es HTML local, vaciamos el input para que «Go live»
    // arranque la presentación local (la rama URL solo actúa si hay texto).
    if (active?.type === 'html') urlInput.value = '';
    else if (active?.url) urlInput.value = active.url;
  }
  // Mientras haya presentación activa, sincronizamos el stack.
  if (presentationActive) renderIframeStack(list, activeIndex);
});

// ─── Notas del ponente ───────────────────────────────────────
// Con sources locales la app lee las notas del HTML guardado y sigue la slide
// actual con los eventos postMessage de reveal.js; las publica al panel, que
// las muestra en otra ventana (no sale en la grabación). La ventana de notas
// de reveal.js no funciona con decks servidos como blob (CAM-BUG-0013).
let deckNotes = { sourceId: null, notes: [] };
let deckSlide = { h: 0, v: 0 };

function activeFrame() {
  return iframeStack?.querySelector('iframe.is-active') ?? null;
}

function enableDeckEvents(frame) {
  sendDeckCommand(frame, { method: 'configure', args: [{ postMessageEvents: true }] });
  sendDeckCommand(frame, { method: 'getIndices', args: [] });
}

function publishNotes() {
  const active = sources.getActive();
  syncChannel.postMessage({
    type: 'notes:update',
    local: active?.type === 'html',
    sourceId: deckNotes.sourceId,
    h: deckSlide.h,
    v: deckSlide.v,
    text: notesAt(deckNotes.notes, deckSlide.h, deckSlide.v),
  });
}

// Carga las notas de la source activa (si cambió) y publica la actual.
async function syncDeckNotes() {
  const active = sources.getActive();
  if (!active || active.id === deckNotes.sourceId) {
    publishNotes();
    return;
  }
  const sourceId = active.id;
  const html = active.type === 'html' ? await readLocalHtml(active) : null;
  if (sources.getActive()?.id !== sourceId) return; // cambió mientras se leía
  deckNotes = { sourceId, notes: html ? parseDeckNotes(html) : [] };
  deckSlide = { h: 0, v: 0 };
  sendDeckCommand(activeFrame(), { method: 'getIndices', args: [] });
  publishNotes();
}

// El panel pide la nota actual al abrirse.
syncChannel.addEventListener('message', event => {
  if (event.data?.type === 'notes:request') publishNotes();
});

window.addEventListener('message', event => {
  // Solo el deck activo: su ventana y el origin que le corresponde según su sandbox.
  const active = sources.getActive();
  if (!active || event.origin !== deckOrigin(active, window.location.origin)) return;
  if (event.source !== activeFrame()?.contentWindow) return;
  // S o H pulsadas con el foco dentro del deck local (script puente); son atajos
  // de una tecla, así que se ignoran si están desactivados.
  const bridgeRequest = bridgeRequestFromMessage(event.data);
  if (bridgeRequest && !singleKeyShortcuts) return;
  if (bridgeRequest === 'open-notes') {
    openControlPanel();
    return;
  }
  if (bridgeRequest === 'toggle-chrome') {
    toggleChrome();
    return;
  }
  const slide = revealSlideFromMessage(event.data);
  if (!slide) return;
  deckSlide = slide;
  publishNotes();
});

// ─── Presentaciones guardadas (pantalla inicial) ─────────────
// Lista para elegir la activa y quitar las que sobran. Al desaparecer una
// source local (aquí, en el panel o al reemplazarla) se borra su fichero de
// OPFS y se olvidan sus cachés.
const savedSourcesList = document.getElementById('savedSources');
const savedSourcesCount = document.getElementById('savedSourcesCount');
const savedSourcesEmpty = document.getElementById('savedSourcesEmpty');
let previousSources = sources.list();

function renderSavedSource(source, index, activeIndex) {
  const { title, kind } = sourceLabel(source);
  const li = document.createElement('li');
  li.className = 'saved-source';

  const pick = document.createElement('button');
  pick.type = 'button';
  pick.className = 'saved-source-pick';
  pick.setAttribute('aria-pressed', String(index === activeIndex));
  const titleEl = document.createElement('span');
  titleEl.className = 'saved-source-title';
  titleEl.textContent = title;
  const kindEl = document.createElement('span');
  kindEl.className = 'saved-source-kind';
  kindEl.textContent = kind;
  pick.append(titleEl, kindEl);
  pick.addEventListener('click', () => sources.setActive(index));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'saved-source-remove';
  remove.textContent = '✕';
  remove.setAttribute('aria-label', `Quitar ${title}`);
  remove.addEventListener('click', () => sources.remove(source.id));

  li.append(pick, remove);
  return li;
}

sources.subscribe(({ list, activeIndex }) => {
  savedSourcesList?.replaceChildren(...list.map((source, index) => renderSavedSource(source, index, activeIndex)));
  if (savedSourcesCount) savedSourcesCount.textContent = list.length ? `(${list.length}/${MAX_SOURCES})` : '';
  if (savedSourcesEmpty) savedSourcesEmpty.hidden = list.length > 0;

  const currentIds = new Set(list.map(s => s.id));
  for (const gone of previousSources.filter(s => !currentIds.has(s.id))) forgetLocalCaches(gone.id);
  for (const file of removedLocalFiles(previousSources, list)) {
    (file.bundle ? removeBundle(file.localRef) : removeHtml(file.localRef))
      .catch(error => console.warn('[sources] no se pudo borrar el fichero local', error));
  }
  previousSources = list;
});

function renderIframeStack(list, activeIndex) {
  if (!iframeStack) return;
  const existing = new Map();
  for (const node of iframeStack.querySelectorAll('iframe[data-source-id]')) {
    existing.set(node.dataset.sourceId, node);
  }

  const targetIds = new Set(list.map(s => s.id));

  // Quitar iframes de sources eliminadas
  for (const [id, node] of existing) {
    if (!targetIds.has(id)) node.remove();
  }

  // Crear iframes nuevos y marcar el activo
  list.forEach((source, index) => {
    let frame = existing.get(source.id);
    if (!frame) {
      frame = document.createElement('iframe');
      frame.dataset.sourceId = source.id;
      // Al cargar, pedir a reveal.js que avise de los cambios de slide (notas).
      frame.addEventListener('load', () => enableDeckEvents(frame));
      // El sandbox debe fijarse antes de la primera navegación del iframe.
      const sandbox = sandboxForSource(source, window.location.origin);
      if (sandbox !== null) frame.setAttribute('sandbox', sandbox);
      const allow = allowForSource(source);
      if (allow !== null) frame.setAttribute('allow', allow);
      if (source.type === 'html') {
        // Source HTML local: el contenido vive en OPFS.
        frame.title = source.title || 'HTML local';
        iframeStack.appendChild(frame);
        // Un .html o una carpeta: blob URLs en un iframe de origin opaco.
        resolveLocalFrameSrc(frame, source);
      } else {
        frame.title = source.title || hostnameOf(source.url);
        frame.src = sanitizePresentationUrl(source.url, window.location.href) ?? source.url;
        iframeStack.appendChild(frame);
      }
    } else {
      // Mantener el src original. Si la URL cambia (no soportado en
      // v1) habría que recrear, lo cual perdería estado.
    }
    frame.classList.toggle('is-active', index === activeIndex);
  });
  syncDeckNotes().catch(error => console.warn('[notes] no se pudieron leer las notas', error));
}

function isPresentationActive() {
  return !presentationSection.hidden;
}

function openControlPanel() {
  if (panelWindow && !panelWindow.closed) {
    panelWindow.focus();
    return;
  }
  const features = 'popup=yes,width=540,height=760,resizable=yes,scrollbars=yes';
  panelWindow = window.open('panel.html', 'cam-panel', features);
  if (!panelWindow) {
    showStatus('Tu navegador bloqueó el popup. Permite popups para este sitio y vuelve a intentarlo.', true);
  }
}

// Diálogo modal accesible: al abrir, el foco entra y queda atrapado; al cerrar,
// vuelve al elemento que lo tenía.
let focusBeforeOnboarding = null;

function openOnboarding() {
  if (!onboarding) return;
  focusBeforeOnboarding = document.activeElement;
  onboarding.hidden = false;
  onboardingClose?.focus();
}

function closeOnboarding(persist = true) {
  if (onboarding && !onboarding.hidden) {
    onboarding.hidden = true;
    focusBeforeOnboarding?.focus?.();
    focusBeforeOnboarding = null;
  }
  if (persist) {
    try { window.localStorage.setItem(ONBOARDED_KEY, 'true'); } catch { /* noop */ }
  }
}

function maybeShowOnboarding() {
  let seen = false;
  try { seen = window.localStorage.getItem(ONBOARDED_KEY) === 'true'; } catch { /* noop */ }
  if (!seen) openOnboarding();
}

function handleGlobalShortcut(event) {
  // Esc cierra el onboarding si está abierto (prioritario).
  if (event.key === 'Escape' && onboarding && !onboarding.hidden) {
    event.preventDefault();
    closeOnboarding();
    return;
  }
  // Saltar si estamos escribiendo en un input/textarea.
  if (event.target?.closest('input, textarea, select, [contenteditable]')) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (!singleKeyShortcuts) return;

  // \ → abrir panel
  if (event.key === '\\') {
    event.preventDefault();
    openControlPanel();
    return;
  }

  // 1..9 → cambiar source activa
  const index = sourceIndexForKey(event, sources.list().length);
  if (index !== null) {
    event.preventDefault();
    sources.setActive(index);
  }
}

function handleKeyboardShortcut(event) {
  if (!isPresentationActive()) return;
  if (onboarding && !onboarding.hidden) return; // Esc cierra la ayuda (handleGlobalShortcut)
  if (event.target?.closest('input, textarea, select, [contenteditable]')) return;
  // S con un deck local: las notas se muestran en el panel (la ventana de notas
  // de reveal.js no funciona con decks servidos como blob, CAM-BUG-0013).
  const plainS = (event.key === 's' || event.key === 'S') && !event.ctrlKey && !event.metaKey && !event.altKey;
  if (singleKeyShortcuts && plainS && sources.getActive()?.type === 'html') {
    event.preventDefault();
    openControlPanel();
    return;
  }
  // Las teclas de navegación son del deck (reveal.js), no de la app: siguen
  // funcionando aunque los atajos de una tecla estén desactivados.
  const deckCommand = deckCommandForKey(event);
  if (deckCommand) {
    event.preventDefault();
    sendDeckCommand(iframeStack?.querySelector('iframe.is-active'), deckCommand);
    return;
  }
  if (!singleKeyShortcuts) return;
  switch (event.key) {
    case 'c':
    case 'C':
      event.preventDefault();
      cyclePosition(event.shiftKey ? -1 : 1);
      break;
    case 'm':
    case 'M':
      event.preventDefault();
      toggleStyle();
      break;
    case 'r':
    case 'R':
      event.preventDefault();
      toggleRecording();
      break;
    case 'h':
    case 'H':
      event.preventDefault();
      toggleChrome();
      break;
    case 'f':
    case 'F':
      event.preventDefault();
      toggleFullscreen();
      break;
    default:
      break;
  }
}

function toggleStyle() {
  const nextStyle = currentStyle === 'frame' ? 'cutout' : 'frame';
  const input = document.querySelector(`input[name="webcam-style"][value="${nextStyle}"]`);
  if (input) input.checked = true;
  updateStyleClass(nextStyle);
  persistState(urlInput.value.trim(), getSelectedPosition(), nextStyle);
}

initializeFromQueryParams().catch(error => {
  console.error(error);
  showStatus(error.message || 'No se pudo preparar la página.', true);
});

updateRecordEstimate();
maybeShowOnboarding();

// Registro del Service Worker (PWA) — solo en contexto seguro.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(error => {
    console.warn('[pwa] Service Worker no registrado', error);
  });
}

// Versión en el pie y aviso cuando se publica una nueva con la app abierta: el
// SW nuevo toma el control (controllerchange). Si no había SW al cargar, es la
// primera visita, no una actualización.
const appVersionEl = document.getElementById('appVersion');
const NEW_VERSION_MESSAGE = 'Hay una versión nueva de la app. Recarga la página para usarla.';
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    showStatus(NEW_VERSION_MESSAGE);
    if (appVersionEl) appVersionEl.textContent += ' · hay una versión nueva: recarga';
  });
}

function showStatus(message, isError = false) {
  if (!message) {
    statusMessage.hidden = true;
    statusMessage.textContent = '';
    statusMessage.classList.remove('error');
    return;
  }
  statusMessage.hidden = false;
  // Los errores se anuncian de inmediato (alert); los estados, educadamente.
  statusMessage.setAttribute('role', isError ? 'alert' : 'status');
  statusMessage.textContent = message;
  statusMessage.classList.toggle('error', isError);
}

function cyclePosition(direction = 1) {
  const total = positions.length;
  currentPositionIndex = (currentPositionIndex + direction + total) % total;
  const newPosition = positions[currentPositionIndex];
  const input = document.querySelector(`input[name="position"][value="${newPosition}"]`);
  if (input) input.checked = true;
  updatePositionClass();
  persistState(urlInput.value.trim(), newPosition, currentStyle);
}

function updatePositionClass(position = null) {
  if (position) {
    const index = positions.indexOf(position);
    currentPositionIndex = index === -1 ? 0 : index;
  }
  webcamSection.classList.remove(...positions);
  webcamSection.classList.add(positions[currentPositionIndex]);
}

function getSelectedPosition() {
  return document.querySelector('input[name="position"]:checked').value;
}

function getSelectedStyle() {
  return document.querySelector('input[name="webcam-style"]:checked').value;
}

function isRecording() {
  return !!recordingCtrl;
}

// Oculta/muestra los controles de la app (topActions, LIVE, herramientas de
// cámara) para que no aparezcan en la grabación. La presentación y la cámara
// siguen visibles. Un botón discreto permite volver a mostrarlos.
function setChromeHidden(hidden) {
  chromeHidden = hidden;
  document.body.classList.toggle('chrome-hidden', hidden);
  if (showChromeBtn) showChromeBtn.hidden = !hidden;
}

function toggleChrome() {
  if (!isPresentationActive()) return;
  setChromeHidden(!chromeHidden);
}

async function updateRecordEstimate() {
  if (!recordEstimate) return;
  try {
    const est = await estimateStorage(6);
    if (est.maxHours > 0) {
      const h = Math.floor(est.maxHours);
      const m = Math.round((est.maxHours - h) * 60);
      const dur = h > 0 ? `${h} h ${m} min` : `${m} min`;
      recordEstimate.textContent =
        `Espacio para ~${dur} de grabación (calidad media, ~${est.gbPerHour.toFixed(1)} GB/h). A disco el límite es tu disco real.`;
    } else {
      recordEstimate.textContent = 'Estimación de espacio no disponible en este navegador.';
    }
  } catch {
    recordEstimate.textContent = '';
  }
}

function updateRecordButton() {
  if (!recordBtn) return;
  recordBtn.classList.toggle('is-recording', isRecording());
  if (recordLabel) recordLabel.textContent = isRecording() ? 'Stop' : 'REC';
}

async function startRecordingFlow() {
  if (isRecording()) return;
  try {
    recordingCtrl = await startScreenRecording({
      withMic: true,
      withSystemAudio: true,
      onStop: (blob, type) => {
        downloadBlob(blob, buildRecordingFilename(new Date(), extFromMime(type)));
        recordingCtrl = null;
        updateRecordButton();
        setChromeHidden(false); // al terminar, volver a mostrar los controles
      },
      onError: error => {
        console.error(error);
        showStatus(error.message || 'Error de grabación.', true);
      },
    });
    updateRecordButton();
    setChromeHidden(true); // ocultar controles para que no salgan en la grabación
    showStatus(''); // ningún aviso encima de lo que se graba
  } catch (error) {
    // El usuario canceló el selector de captura u otro fallo: seguimos sin grabar.
    console.warn('Grabación no iniciada', error);
    recordingCtrl = null;
    updateRecordButton();
    showStatus('Grabación no iniciada. Puedes activarla con el botón REC.', false);
  }
}

function stopRecording() {
  if (recordingCtrl) recordingCtrl.stop(); // dispara onStop → descarga
}

function toggleRecording() {
  if (!isPresentationActive()) return;
  if (isRecording()) stopRecording();
  else startRecordingFlow();
}

async function handleLocalHtmlPick(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!/\.html?$/i.test(file.name)) {
    showStatus('Selecciona un fichero .html', true);
    event.target.value = '';
    return;
  }
  try {
    const title = file.name.replace(/\.html?$/i, '');
    // Mismo nombre: se reemplaza (no cuenta para el límite). Si no cabe, no
    // guardar en OPFS para no dejar un fichero huérfano.
    const previous = sources.findLocal({ title, bundle: false });
    if (!previous && sources.isFull()) throw new Error(SOURCES_FULL_MESSAGE);
    const id = await saveHtml(file);
    sources.addLocal({ type: 'html', title, localRef: id });
    if (previous) {
      forgetLocalCaches(previous.id); // mismo id: su fichero viejo lo borra la limpieza de sources
    }
    showStatus(previous
      ? 'HTML local actualizado. Pulsa «Go live» para presentarlo.'
      : 'HTML local añadido. Pulsa «Go live» para presentarlo.');
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'No se pudo cargar el HTML local.', true);
  } finally {
    event.target.value = '';
  }
}

async function handleLocalBundlePick() {
  if (typeof window.showDirectoryPicker !== 'function') {
    showStatus('Tu navegador no permite elegir carpetas. Usa Chrome o Edge, o carga un .html autocontenido.', true);
    return;
  }
  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker();
  } catch {
    return; // el usuario canceló el selector
  }
  try {
    const title = dirHandle.name || 'Presentación HTML';
    const previous = sources.findLocal({ title, bundle: true });
    if (!previous && sources.isFull()) throw new Error(SOURCES_FULL_MESSAGE);
    const id = await saveBundle(dirHandle);
    sources.addLocal({ type: 'html', bundle: true, title, localRef: id });
    if (previous) {
      forgetLocalCaches(previous.id); // mismo id: su fichero viejo lo borra la limpieza de sources
    }
    showStatus(previous
      ? 'Carpeta HTML actualizada. Pulsa «Go live» para presentarla.'
      : 'Carpeta HTML añadida. Pulsa «Go live» para presentarla.');
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'No se pudo cargar la carpeta.', true);
  }
}

// Una source local reemplazada conserva su id: olvidar su blob y sus notas
// cacheados para que se use el fichero nuevo.
function forgetLocalCaches(sourceId) {
  localBlobUrls.get(sourceId)?.urls.forEach(url => URL.revokeObjectURL(url));
  localBlobUrls.delete(sourceId);
  if (deckNotes.sourceId === sourceId) deckNotes = { sourceId: null, notes: [] };
}

// Blob URLs de una source local: { indexUrl, urls (todas, para revocarlas) }.
// Con el script puente: S/H dentro del deck llegan a la app.
async function createLocalBlobs(source) {
  if (source.bundle) {
    const files = await readBundleFiles(source.localRef);
    if (files === null) return null;
    const blobs = await buildBundleBlobs(files, {
      createIndexUrl: blob => URL.createObjectURL(blob),
      wrapIndex: injectDeckBridge,
    });
    if (blobs.unresolved.length) console.warn('[bundle] recursos no encontrados en la carpeta:', blobs.unresolved);
    return blobs;
  }
  const html = await readLocalHtml(source);
  if (html === null) return null;
  const indexUrl = URL.createObjectURL(new Blob([injectDeckBridge(html)], { type: 'text/html;charset=utf-8' }));
  return { indexUrl, urls: [indexUrl] };
}

async function resolveLocalFrameSrc(frame, source) {
  try {
    let blobs = localBlobUrls.get(source.id);
    if (!blobs) {
      blobs = await createLocalBlobs(source);
      if (blobs === null) {
        showStatus('No se encontró el HTML local guardado. Vuelve a cargarlo.', true);
        return;
      }
      localBlobUrls.set(source.id, blobs);
    }
    frame.src = blobs.indexUrl;
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'No se pudo abrir el HTML local.', true);
  }
}

async function startPresentation(presetUrl) {
  const selectedPosition = getSelectedPosition();
  const selectedStyle = getSelectedStyle();
  const rawUrl = (presetUrl ?? urlInput.value).trim();
  const active = sources.getActive();
  const startingLocal = !rawUrl && active?.type === 'html';

  if (!rawUrl && !startingLocal) {
    showStatus('Introduce la URL de la presentación, carga un HTML local o usa el ejemplo.', true);
    urlInput.focus();
    return;
  }

  let url = null;
  if (rawUrl) {
    url = sanitizePresentationUrl(rawUrl, window.location.href);
    if (!url) {
      showStatus('URL no válida. Solo se aceptan enlaces http:// o https://', true);
      urlInput.focus();
      return;
    }
    // Registrar la URL en el store multi-source (si no estaba ya).
    if (!sources.add(url, deriveSourceTitle(url))) {
      showStatus(SOURCES_FULL_MESSAGE, true);
      return;
    }
  }

  showStatus('Cargando presentación...');
  presentationActive = true;
  renderIframeStack(sources.list(), sources.getActiveIndex());
  presentationSection.hidden = false;
  if (topActions) topActions.hidden = false;
  startLiveBadge();
  updatePositionClass(selectedPosition);
  updateStyleClass(selectedStyle);
  if (url) persistState(url, selectedPosition, selectedStyle);
  updateRecordButton();
  // Auto-grabación (si está activada): se lanza dentro del gesto «Go live»
  // para que el navegador permita getDisplayMedia. Si el usuario cancela el
  // selector, startRecordingFlow lo gestiona y la presentación continúa.
  if (autoRecordEnabled) await startRecordingFlow();
  await startWebcam().catch(error => {
    console.error(error);
    showStatus(error.message || 'No se pudo iniciar la webcam.', true);
  });
}

async function startWebcam() {
  stopWebcam();
  renderer?.reset(); // nueva cámara: sin arrastrar la ausencia anterior
  noPersonNoticeShown = false;
  showStatus('Solicitando acceso a la cámara...');
  const mediaStream = await cameraRequests.acquire();
  if (!mediaStream) return; // otra petición más reciente (o volver al setup) la sustituyó
  stream = mediaStream;
  video.srcObject = stream;
  await video.play();
  if (!cameraRequests.isCurrent(mediaStream)) return;
  webcamSection.hidden = false;
  populateCameraSelect().catch(() => {}); // refresca labels una vez concedido el permiso
  showStatus('');
  await ensureCutout(); // en modo marco no descarga nada
}

// Arranca el bucle de canvas solo si el estilo lo necesita y no está ya en marcha.
function ensureRenderLoop() {
  if (!stream || !net || cameraLoop.isRunning() || !needsCanvasLoop(currentStyle)) return;
  renderer ??= createCutoutRenderer({
    video,
    canvas,
    segment: segmentPerson,
    now: () => performance.now(),
    intervalMs: SEGMENTATION_INTERVAL_MS,
  });
  firstFrameDrawn = false;
  cameraLoop.start();
}

async function populateCameraSelect() {
  if (!cameraSelect || !navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(d => d.kind === 'videoinput');
    cameraSelect.innerHTML = '';
    const autoOption = document.createElement('option');
    autoOption.value = '';
    autoOption.textContent = 'Automática';
    cameraSelect.appendChild(autoOption);
    cameras.forEach((cam, index) => {
      const option = document.createElement('option');
      option.value = cam.deviceId;
      option.textContent = cam.label || `Cámara ${index + 1}`;
      cameraSelect.appendChild(option);
    });
    if (currentDeviceId && cameras.some(c => c.deviceId === currentDeviceId)) {
      cameraSelect.value = currentDeviceId;
    }
    cameraFieldset.hidden = cameras.length < 2;
  } catch (error) {
    console.warn('No se pudieron listar las cámaras.', error);
  }
}

async function requestVideoStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Tu navegador necesita un contexto seguro (https o localhost) para usar la cámara.');
  }
  const deviceId = currentDeviceId;
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
    } catch (error) {
      console.warn('Cámara seleccionada no disponible, intentando frontal genérica.', error);
    }
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } } });
  } catch (error) {
    console.warn('No se pudo aplicar facingMode, usando vídeo por defecto.', error);
    return navigator.mediaDevices.getUserMedia({ video: true });
  }
}

function stopWebcam() {
  cameraRequests.cancel();
  cameraLoop.stop();
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
}

async function loadBodyPix() {
  if (net) return net;
  // Las librerías se descargan aquí, la primera vez que hace falta el recorte.
  netPromise ??= loadBodyPixLibrary().then(api => {
    bodyPix = api;
    return api.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2,
      // Pesos servidos desde el propio sitio (scripts/fetch-model.mjs), no desde googleapis.
      modelUrl: new URL('models/bodypix/model-stride16.json', document.baseURI).href,
    });
  });
  try {
    net = await netPromise;
  } catch (error) {
    netPromise = null; // permitir reintentar al volver a elegir el recorte
    throw error;
  }
  return net;
}

// Recorte bajo demanda: carga el modelo si hace falta y arranca el bucle. Si la
// carga falla, vuelve al marco y lo dice (la presentación sigue).
async function ensureCutout() {
  if (!stream || !needsCanvasLoop(currentStyle)) return;
  if (!net) {
    showStatus('Cargando el recorte de fondo…');
    try {
      await loadBodyPix();
    } catch (error) {
      console.error(error);
      updateStyleClass('frame');
      showStatus('No se pudo cargar el recorte de fondo: se muestra la cámara con marco.', true);
      return;
    }
    if (!stream || !needsCanvasLoop(currentStyle)) return;
  }
  if (!cameraLoop.isRunning()) showStatus('Procesando la señal de vídeo, esto puede tardar un par de segundos...');
  ensureRenderLoop();
}

// Segmentación con BodyPix: 0/1 por píxel (presencia) y la máscara para componer.
async function segmentPerson(source) {
  const segmentation = await net.segmentPerson(source, {
    flipHorizontal: false,
    internalResolution: 'medium',
    segmentationThreshold: 0.7
  });
  const mask = bodyPix.toMask(
    segmentation,
    { r: 0, g: 0, b: 0, a: 255 }, // persona opaca
    { r: 0, g: 0, b: 0, a: 0 }    // fondo transparente
  );
  return { data: segmentation.data, mask };
}

// Aviso persistente (estilo error, para que el primer frame no lo limpie) mientras
// el recorte no detecte a nadie; se retira solo si sigue siendo el aviso visible.
function syncNoPersonNotice() {
  const absent = currentStyle === 'cutout' && renderer !== null && !renderer.isPersonPresent();
  if (absent === noPersonNoticeShown) return;
  noPersonNoticeShown = absent;
  if (absent) showStatus(NO_PERSON_MESSAGE, true);
  else if (statusMessage.textContent === NO_PERSON_MESSAGE) showStatus('');
}

// Un paso del bucle de cámara; devuelve false para detenerlo.
function renderStep() {
  if (!stream) {
    showStatus('La cámara se detuvo.', true);
    return false;
  }
  if (!needsCanvasLoop(currentStyle)) {
    // Modo marco: el <video> se ve directamente; el bucle se detiene.
    syncNoPersonNotice();
    return false;
  }
  if (!video.videoWidth || !video.videoHeight) return true; // aún sin frames
  renderer.drawFrame();
  syncNoPersonNotice();
  if (!firstFrameDrawn) {
    // Solo tras el primer frame: retirar el «Procesando…» (no los errores).
    firstFrameDrawn = true;
    if (!statusMessage.classList.contains('error')) showStatus('');
  }
  return true;
}

window.addEventListener('beforeunload', stopWebcam);
function returnToSetup() {
  stopRecording(); // si había grabación en curso, se detiene y se descarga
  updateRecordButton();
  setChromeHidden(false); // restaurar controles al salir
  stopWebcam();
  stopLiveBadge();
  presentationActive = false;
  if (iframeStack) iframeStack.replaceChildren();
  // Revocar blob URLs de sources HTML locales para no fugar memoria.
  for (const { urls } of localBlobUrls.values()) {
    urls.forEach(url => URL.revokeObjectURL(url));
  }
  localBlobUrls.clear();
  presentationSection.hidden = true;
  webcamSection.hidden = true;
  if (topActions) topActions.hidden = true;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  showStatus('');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startLiveBadge() {
  if (!liveBadge) return;
  liveBadge.hidden = false;
  liveStartedAt = Date.now();
  if (liveTime) liveTime.textContent = '00:00';
  liveTimerId = window.setInterval(tickLiveBadge, 1000);
}

function stopLiveBadge() {
  if (!liveBadge) return;
  liveBadge.hidden = true;
  if (liveTimerId) {
    window.clearInterval(liveTimerId);
    liveTimerId = null;
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    console.warn('Fullscreen no disponible.', error);
    showStatus('Fullscreen no disponible en este navegador.', true);
  }
}

function syncFullscreenButton() {
  if (!fullscreenBtn) return;
  fullscreenBtn.classList.toggle('is-fullscreen', !!document.fullscreenElement);
}

function tickLiveBadge() {
  if (!liveTime) return;
  const elapsed = Math.floor((Date.now() - liveStartedAt) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  liveTime.textContent = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateStyleClass(style) {
  if (!styles.includes(style)) {
    style = 'frame';
  }
  currentStyle = style;
  webcamSection.classList.remove(...styles);
  webcamSection.classList.add(style);
  // Al pasar a recorte carga el modelo si aún no está; en marco el bucle se para solo.
  ensureCutout().catch(error => console.error(error));
}

function updateSizeClass(size) {
  if (!sizes.includes(size)) {
    size = 'm';
  }
  currentSize = size;
  webcamSection.classList.remove(...sizes.map(s => `size-${s}`));
  webcamSection.classList.add(`size-${size}`);
}

function persistState(url, position, style) {
  const newQuery = buildQuery(window.location.search, { url, position, style, size: currentSize });
  const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
  window.history.replaceState({}, '', newUrl);
}
async function initializeFromQueryParams() {
  const { presentationUrl, position, style, size: sizeParam, legacyCameraId } =
    parseQuery(window.location.search, window.location.href);

  if (presentationUrl) {
    urlInput.value = presentationUrl;
  } else {
    // Sin URL en query: si hay sources guardadas, pre-rellenar con la activa
    // para que el usuario pueda darle a "Go live" directamente.
    const active = sources.getActive();
    if (active?.url) urlInput.value = active.url;
  }
  if (position) {
    const positionInput = document.querySelector(`input[name="position"][value="${position}"]`);
    if (positionInput) {
      positionInput.checked = true;
    }
    updatePositionClass(position);
  } else {
    updatePositionClass(document.querySelector('input[name="position"]:checked').value);
  }
  const initialStyle = style ?? document.querySelector('input[name="webcam-style"]:checked').value;
  const styleInput = document.querySelector(`input[name="webcam-style"][value="${initialStyle}"]`);
  if (styleInput) {
    styleInput.checked = true;
  }
  updateStyleClass(initialStyle);

  const initialSize = sizeParam ?? document.querySelector('input[name="webcam-size"]:checked')?.value ?? 'm';
  const sizeInput = document.querySelector(`input[name="webcam-size"][value="${initialSize}"]`);
  if (sizeInput) sizeInput.checked = true;
  updateSizeClass(initialSize);

  // ?camera= de enlaces antiguos se migra a localStorage; persistState lo quita.
  if (legacyCameraId) persistCameraId(legacyCameraId);
  currentDeviceId = legacyCameraId ?? readCameraId();
  await populateCameraSelect();

  if (presentationUrl) {
    await startPresentation(presentationUrl).catch(error => {
      console.error(error);
      showStatus(error.message || 'No se pudo iniciar la webcam.', true);
    });
  }
}

// Versión publicada en el pie. Al final del módulo: este await no retrasa nada
// de lo anterior (manejadores, arranque de la app).
const versionInfo = await loadVersion();
if (appVersionEl) appVersionEl.textContent = formatVersion(versionInfo);
