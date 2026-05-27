/**
 * Ventana de control (panel.html).
 *
 * Esta primera entrega monta el esqueleto: una lista de "sources"
 * persistida en localStorage (compartida con la ventana principal),
 * un input para añadir URLs, y un BroadcastChannel que confirma la
 * conexión con la principal.
 *
 * La fase siguiente (CAM-TSK-0002 y posteriores) añadirá miniaturas
 * iframe vivas, switcher por click, atajos numéricos y sincronización
 * bidireccional de activeIndex.
 */

import { createSourcesStore, bindSourcesToChannel } from './sources.js';

const sources = createSourcesStore();
const linkStatus = document.getElementById('linkStatus');
const linkLabel = linkStatus?.querySelector('.panel-link-label');
const hint = document.getElementById('sourcesHint');
const list = document.getElementById('panelSources');
const addInput = document.getElementById('panelAddInput');
const addBtn = document.getElementById('panelAddBtn');

const channel = new BroadcastChannel('cam.sync');
const binding = bindSourcesToChannel(sources, channel);
let linked = false;
let linkLostTimer = null;

// Debug helper accesible desde la consola del navegador.
window.__cam = { sources, channel, binding, role: 'panel' };

channel.addEventListener('message', event => {
  const { type } = event.data || {};
  switch (type) {
    case 'main:hello':
      // La ventana principal acaba de saludar — confirmamos.
      channel.postMessage({ type: 'panel:hello-ack' });
      markLinked();
      break;
    case 'main:heartbeat':
      markLinked();
      break;
    default:
      break;
  }
});

// Anunciamos nuestra presencia. Si la principal no está abierta aún,
// el ack llegará cuando ella lance su hello.
channel.postMessage({ type: 'panel:hello' });

// Si pasan más de 8s sin hello-ack, marcamos "lost" (la principal puede haberse cerrado).
linkLostTimer = window.setTimeout(() => {
  if (!linked) setStatus('lost', 'main window not detected');
}, 8000);

function setStatus(state, label) {
  if (!linkStatus) return;
  linkStatus.dataset.state = state;
  if (linkLabel) linkLabel.textContent = label;
}

function markLinked() {
  linked = true;
  if (linkLostTimer) { window.clearTimeout(linkLostTimer); linkLostTimer = null; }
  setStatus('linked', 'linked to main');
  // Re-armamos el watchdog. Si la principal cae más de 12s sin heartbeat → lost.
  linkLostTimer = window.setTimeout(() => {
    linked = false;
    setStatus('lost', 'main window not detected');
  }, 12000);
}

// Mientras no haya sincronizado con la principal (o vencido el timeout),
// deshabilitamos el input add para no pisar la lista de la otra ventana.
if (addInput) addInput.disabled = true;
if (addBtn) addBtn.disabled = true;
binding.initialSync.then(({ synced }) => {
  if (addInput) addInput.disabled = false;
  if (addBtn) addBtn.disabled = false;
  console.debug('[cam] panel initial sync:', synced ? 'received from main' : 'timeout, using localStorage', sources.snapshot());
});

addBtn?.addEventListener('click', () => addCurrent());
addInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addCurrent();
  }
});

function addCurrent() {
  if (!addInput) return;
  const raw = addInput.value.trim();
  if (!raw) return;
  const url = normalizeRawUrl(raw);
  if (!url) {
    addInput.classList.add('panel-add-input--invalid');
    setTimeout(() => addInput.classList.remove('panel-add-input--invalid'), 600);
    return;
  }
  sources.add(url);
  addInput.value = '';
}

function normalizeRawUrl(raw) {
  try {
    const parsed = new URL(raw, window.location.href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// Cache de iframes vivos indexada por source.id. Debe declararse ANTES del
// primer subscribe: la suscripción dispara una emisión inmediata que entra
// en renderList y consulta iframeCache; si la const está en TDZ aborta el
// script y el panel se queda en blanco silenciosamente.
const iframeCache = new Map();

sources.subscribe(state => {
  renderList(state);
});

function renderList({ list: items, activeIndex }) {
  if (!list || !hint) return;
  hint.hidden = items.length > 0;

  // Quitar del cache los que ya no están
  const currentIds = new Set(items.map(s => s.id));
  for (const id of [...iframeCache.keys()]) {
    if (!currentIds.has(id)) iframeCache.delete(id);
  }

  list.replaceChildren(...items.map((item, index) => renderSource(item, index, activeIndex)));
}

function renderSource(item, index, activeIndex) {
  const isActive = index === activeIndex;

  const li = document.createElement('li');
  li.className = 'panel-source';
  li.dataset.active = String(isActive);
  li.dataset.id = item.id;

  // Header con número, título y botones
  const header = document.createElement('div');
  header.className = 'panel-source-header';

  const num = document.createElement('span');
  num.className = 'panel-source-num';
  num.textContent = String(index + 1);

  const titleBlock = document.createElement('div');
  titleBlock.className = 'panel-source-title';
  const name = document.createElement('span');
  name.className = 'panel-source-name';
  name.textContent = item.title || hostnameOf(item.url);
  const urlEl = document.createElement('span');
  urlEl.className = 'panel-source-url';
  urlEl.textContent = item.url;
  titleBlock.append(name, urlEl);

  const actions = document.createElement('div');
  actions.className = 'panel-source-actions';

  const activateBtn = document.createElement('button');
  activateBtn.type = 'button';
  activateBtn.className = 'panel-source-btn panel-source-btn--primary';
  activateBtn.title = isActive ? 'Activa' : 'Activar';
  activateBtn.setAttribute('aria-label', isActive ? 'Activa' : 'Activar');
  activateBtn.innerHTML = isActive
    ? '<svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><circle cx="7" cy="7" r="3" fill="currentColor"/></svg>'
    : '<svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><circle cx="7" cy="7" r="3" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
  activateBtn.addEventListener('click', event => {
    event.stopPropagation();
    sources.setActiveById(item.id);
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'panel-source-btn panel-source-btn--danger';
  removeBtn.title = 'Quitar';
  removeBtn.setAttribute('aria-label', 'Quitar');
  removeBtn.innerHTML = '<svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  removeBtn.addEventListener('click', event => {
    event.stopPropagation();
    sources.remove(item.id);
  });

  actions.append(activateBtn, removeBtn);
  header.append(num, titleBlock, actions);

  // Viewport con el iframe vivo (cacheado para mantener estado interno)
  const viewport = document.createElement('div');
  viewport.className = 'panel-source-viewport';

  let frame = iframeCache.get(item.id);
  if (!frame || frame.dataset.url !== item.url) {
    frame = document.createElement('iframe');
    frame.src = item.url;
    frame.title = item.title || hostnameOf(item.url);
    frame.loading = 'eager';
    frame.dataset.url = item.url;
    iframeCache.set(item.id, frame);
  }

  // El iframe queda interactivo (puedes avanzar slides dentro del panel
  // sin afectar a la principal — el estado se conserva aquí).
  // El cambio de "activa" se hace por el botón del header o pulsando la
  // tecla numérica correspondiente.
  viewport.append(frame);

  // Card structure: header on top, viewport below
  li.append(header, viewport);

  return li;
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// Atajos numéricos 1-9 en el panel
document.addEventListener('keydown', event => {
  if (event.target?.closest('input, textarea, select, [contenteditable]')) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (!/^[1-9]$/.test(event.key)) return;
  const index = Number(event.key) - 1;
  const list = sources.list();
  if (index < list.length) {
    event.preventDefault();
    sources.setActive(index);
  }
});

// Heartbeat hacia la principal para que detecte cierre del panel si ocurre.
window.setInterval(() => channel.postMessage({ type: 'panel:heartbeat' }), 4000);
window.addEventListener('beforeunload', () => {
  try { channel.postMessage({ type: 'panel:bye' }); } catch { /* noop */ }
});
