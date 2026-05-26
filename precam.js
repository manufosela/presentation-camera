const presentationSection = document.getElementById('presentationSection');
const presentationIframe = document.getElementById('presentationIframe');
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
  cyclePosition();
});
webcamSection.addEventListener('click', cyclePosition);
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
document.addEventListener('keydown', handleKeyboardShortcut);

function isPresentationActive() {
  return !presentationSection.hidden;
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
    case 'Escape':
      event.preventDefault();
      returnToSetup();
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

function sanitizePresentationUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl, window.location.href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
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
  showStatus('Cargando presentación...');
  presentationIframe.src = url;
  presentationSection.hidden = false;
  homeButton.hidden = false;
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
  presentationIframe.src = '';
  presentationSection.hidden = true;
  webcamSection.hidden = true;
  homeButton.hidden = true;
  showStatus('Configuración lista para iniciar una nueva presentación.');
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
