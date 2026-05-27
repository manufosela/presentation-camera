import { createSourcesStore, bindSourcesToChannel } from './sources.js';

const sources = createSourcesStore();
let isPanelWindow = false; // panel.js puede inspeccionarlo si lo necesita

// ─── BroadcastChannel hacia el panel de control ──────────────
// Canal compartido para sync de sources (sources:* messages) y para
// presencia (main:* / panel:*).
const syncChannel = new BroadcastChannel('cam.sync');
const sourcesBinding = bindSourcesToChannel(sources, syncChannel);

// Debug helper accesible desde la consola del navegador.
window.__cam = { sources, channel: syncChannel, binding: sourcesBinding, role: 'main' };
let panelLinked = false;
syncChannel.addEventListener('message', event => {
  const { type } = event.data || {};
  switch (type) {
    case 'panel:hello':
    case 'panel:heartbeat':
      panelLinked = true;
      syncChannel.postMessage({ type: 'main:heartbeat' });
      break;
    case 'panel:hello-ack':
      panelLinked = true;
      break;
    case 'panel:bye':
      panelLinked = false;
      break;
    default:
      break;
  }
});
syncChannel.postMessage({ type: 'main:hello' });
window.setInterval(() => {
  if (panelLinked) syncChannel.postMessage({ type: 'main:heartbeat' });
}, 4000);
window.addEventListener('beforeunload', () => {
  try { syncChannel.postMessage({ type: 'main:bye' }); } catch { /* noop */ }
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

let panelWindow = null;

const positions = ['bottom-right', 'bottom-left', 'top-left', 'top-right'];
const styles = ['frame', 'cutout'];
const sizes = ['s', 'm', 'l'];
const SEGMENTATION_INTERVAL_MS = 50; // ~20 fps para BodyPix
let currentPositionIndex = 0;
let currentStyle = 'frame';
let stream;
let animationFrameId;
let net;
let netPromise;
let canvasCtx;
let lastMask = null;
let lastSegmentationAt = 0;
let segmentationInFlight = false;
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
    if (active?.url) urlInput.value = active.url;
  }
  // Mientras haya presentación activa, sincronizamos el stack.
  if (presentationActive) renderIframeStack(list, activeIndex);
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
      frame.title = source.title || hostnameOf(source.url);
      frame.src = sanitizePresentationUrl(source.url) ?? source.url;
      iframeStack.appendChild(frame);
    } else {
      // Mantener el src original. Si la URL cambia (no soportado en
      // v1) habría que recrear, lo cual perdería estado.
    }
    frame.classList.toggle('is-active', index === activeIndex);
  });
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
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

function handleGlobalShortcut(event) {
  // Saltar si estamos escribiendo en un input/textarea.
  if (event.target?.closest('input, textarea, select, [contenteditable]')) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  // \ → abrir panel
  if (event.key === '\\') {
    event.preventDefault();
    openControlPanel();
    return;
  }

  // 1..9 → cambiar source activa
  if (/^[1-9]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    const list = sources.list();
    if (index < list.length) {
      event.preventDefault();
      sources.setActive(index);
    }
  }
}

function handleKeyboardShortcut(event) {
  if (!isPresentationActive()) return;
  if (event.target?.closest('input, textarea, select, [contenteditable]')) return;
  switch (event.key) {
    case 'ArrowRight':
      event.preventDefault();
      cyclePosition(1);
      break;
    case 'ArrowLeft':
      event.preventDefault();
      cyclePosition(-1);
      break;
    case 'b':
    case 'B':
      event.preventDefault();
      toggleStyle();
      break;
    case 'f':
    case 'F':
      event.preventDefault();
      toggleFullscreen();
      break;
    case 'Escape':
      event.preventDefault();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        returnToSetup();
      }
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

function showStatus(message, isError = false) {
  if (!message) {
    statusMessage.hidden = true;
    statusMessage.textContent = '';
    statusMessage.classList.remove('error');
    return;
  }
  statusMessage.hidden = false;
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

function deriveSourceTitle(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'docs.google.com') return 'Google Slides';
    if (parsed.hostname.endsWith('genially.com') || parsed.hostname.endsWith('genial.ly')) return 'Genially';
    if (parsed.hostname.includes('canva.com')) return 'Canva';
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function sanitizePresentationUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl, window.location.href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return normalizeEmbeddableUrl(parsed).toString();
  } catch {
    return null;
  }
}

// Algunos servicios tienen URLs distintas para "editar" vs "embeber".
// Cuando detectamos una URL de editor, la sustituimos por la versión apta
// para iframe — así el usuario puede pegar la URL que tenga abierta.
function normalizeEmbeddableUrl(url) {
  // Google Slides: /edit, /edit?usp=sharing → /preview
  // La URL /present rechaza ser embebida (X-Frame-Options SAMEORIGIN),
  // por eso al pulsar "Presentar" desde /edit la app queda en blanco.
  if (url.hostname === 'docs.google.com' && url.pathname.includes('/presentation/d/')) {
    const slidesId = url.pathname.match(/\/presentation\/d\/([^/]+)/)?.[1];
    if (slidesId) {
      const next = new URL(url);
      next.pathname = `/presentation/d/${slidesId}/preview`;
      next.search = ''; // limpiamos params de edit (usp, ouid…)
      next.hash = '';
      return next;
    }
  }
  return url;
}

async function startPresentation(presetUrl) {
  const selectedPosition = getSelectedPosition();
  const selectedStyle = getSelectedStyle();
  const rawUrl = (presetUrl ?? urlInput.value).trim();
  if (!rawUrl) {
    showStatus('Introduce la URL de la presentación o usa el ejemplo.', true);
    urlInput.focus();
    return;
  }
  const url = sanitizePresentationUrl(rawUrl);
  if (!url) {
    showStatus('URL no válida. Solo se aceptan enlaces http:// o https://', true);
    urlInput.focus();
    return;
  }
  // Registrar la URL en el store multi-source (si no estaba ya).
  sources.add(url, deriveSourceTitle(url));

  showStatus('Cargando presentación...');
  presentationActive = true;
  renderIframeStack(sources.list(), sources.getActiveIndex());
  presentationSection.hidden = false;
  if (topActions) topActions.hidden = false;
  startLiveBadge();
  updatePositionClass(selectedPosition);
  updateStyleClass(selectedStyle);
  persistState(url, selectedPosition, selectedStyle);
  await startWebcam().catch(error => {
    console.error(error);
    showStatus(error.message || 'No se pudo iniciar la webcam.', true);
  });
}

async function startWebcam() {
  stopWebcam();
  showStatus('Solicitando acceso a la cámara...');
  const mediaStream = await requestVideoStream();
  stream = mediaStream;
  video.srcObject = stream;
  await video.play();
  webcamSection.hidden = false;
  populateCameraSelect().catch(() => {}); // refresca labels una vez concedido el permiso
  showStatus('Cargando modelo BodyPix...');
  const model = await loadBodyPix();
  showStatus('Procesando la señal de vídeo, esto puede tardar un par de segundos...');
  renderLoop(model);
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
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
}

async function loadBodyPix() {
  if (net) return net;
  if (!netPromise) {
    netPromise = bodyPix.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2
    });
  }
  net = await netPromise;
  return net;
}

function getCanvasCtx() {
  if (!canvasCtx) {
    canvasCtx = canvas.getContext('2d', { willReadFrequently: true });
  }
  return canvasCtx;
}

async function refreshMask(model) {
  if (segmentationInFlight) return;
  segmentationInFlight = true;
  try {
    const segmentation = await model.segmentPerson(video, {
      flipHorizontal: false,
      internalResolution: 'medium',
      segmentationThreshold: 0.7
    });
    lastMask = bodyPix.toMask(
      segmentation,
      { r: 0, g: 0, b: 0, a: 255 }, // persona opaca
      { r: 0, g: 0, b: 0, a: 0 }    // fondo transparente
    );
    lastSegmentationAt = performance.now();
  } finally {
    segmentationInFlight = false;
  }
}

async function renderLoop(model) {
  if (!stream) {
    showStatus('La cámara se detuvo.', true);
    return;
  }
  if (!video.videoWidth || !video.videoHeight) {
    animationFrameId = requestAnimationFrame(() => renderLoop(model));
    return;
  }

  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvasCtx = null; // contexto invalidado al redimensionar
    lastMask = null;
  }

  const ctx = getCanvasCtx();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (currentStyle === 'frame') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } else {
    const elapsed = performance.now() - lastSegmentationAt;
    if (!lastMask || elapsed >= SEGMENTATION_INTERVAL_MS) {
      refreshMask(model).catch(error => console.warn('Segmentación fallida', error));
    }
    if (lastMask) {
      ctx.putImageData(lastMask, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  animationFrameId = requestAnimationFrame(() => renderLoop(model));
  if (!statusMessage.hidden && !statusMessage.classList.contains('error')) {
    showStatus('');
  }
}

window.addEventListener('beforeunload', stopWebcam);
function returnToSetup() {
  stopWebcam();
  stopLiveBadge();
  presentationActive = false;
  if (iframeStack) iframeStack.replaceChildren();
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
  const params = new URLSearchParams(window.location.search);
  if (url) {
    params.set('presentation', url);
  } else {
    params.delete('presentation');
  }
  if (positions.includes(position)) {
    params.set('position', position);
  }
  if (styles.includes(style)) {
    params.set('style', style);
  }
  if (sizes.includes(currentSize)) {
    params.set('size', currentSize);
  }
  if (currentDeviceId) {
    params.set('camera', currentDeviceId);
  } else {
    params.delete('camera');
  }
  const newQuery = params.toString();
  const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
  window.history.replaceState({}, '', newUrl);
}
async function initializeFromQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const presentationUrl = sanitizePresentationUrl(params.get('presentation'));
  const position = params.get('position');
  const style = params.get('style');

  if (presentationUrl) {
    urlInput.value = presentationUrl;
  } else {
    // Sin URL en query: si hay sources guardadas, pre-rellenar con la activa
    // para que el usuario pueda darle a "Go live" directamente.
    const active = sources.getActive();
    if (active?.url) urlInput.value = active.url;
  }
  if (position && positions.includes(position)) {
    const positionInput = document.querySelector(`input[name="position"][value="${position}"]`);
    if (positionInput) {
      positionInput.checked = true;
    }
    updatePositionClass(position);
  } else {
    updatePositionClass(document.querySelector('input[name="position"]:checked').value);
  }
  const initialStyle = style && styles.includes(style)
    ? style
    : document.querySelector('input[name="webcam-style"]:checked').value;
  const styleInput = document.querySelector(`input[name="webcam-style"][value="${initialStyle}"]`);
  if (styleInput) {
    styleInput.checked = true;
  }
  updateStyleClass(initialStyle);

  const sizeParam = params.get('size');
  const initialSize = sizes.includes(sizeParam)
    ? sizeParam
    : document.querySelector('input[name="webcam-size"]:checked')?.value || 'm';
  const sizeInput = document.querySelector(`input[name="webcam-size"][value="${initialSize}"]`);
  if (sizeInput) sizeInput.checked = true;
  updateSizeClass(initialSize);

  const cameraParam = params.get('camera');
  if (cameraParam) currentDeviceId = cameraParam;
  await populateCameraSelect();

  if (presentationUrl) {
    await startPresentation(presentationUrl).catch(error => {
      console.error(error);
      showStatus(error.message || 'No se pudo iniciar la webcam.', true);
    });
  }
}
