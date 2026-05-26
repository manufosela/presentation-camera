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

import { createSourcesStore } from './sources.js';

const sources = createSourcesStore();
const linkStatus = document.getElementById('linkStatus');
const linkLabel = linkStatus?.querySelector('.panel-link-label');
const hint = document.getElementById('sourcesHint');
const list = document.getElementById('panelSources');
const addInput = document.getElementById('panelAddInput');
const addBtn = document.getElementById('panelAddBtn');

const channel = new BroadcastChannel('cam.sync');
let linked = false;
let linkLostTimer = null;

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

sources.subscribe(state => {
  renderList(state);
});

function renderList({ list: items, activeIndex }) {
  if (!list || !hint) return;
  hint.hidden = items.length > 0;
  list.replaceChildren(...items.map((item, index) => renderSource(item, index, activeIndex)));
}

function renderSource(item, index, activeIndex) {
  const li = document.createElement('li');
  li.className = 'panel-source';
  li.dataset.active = String(index === activeIndex);
  li.dataset.id = item.id;

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

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'panel-source-btn panel-source-btn--danger';
  removeBtn.title = 'Quitar';
  removeBtn.setAttribute('aria-label', 'Quitar');
  removeBtn.innerHTML = '<svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  removeBtn.addEventListener('click', () => sources.remove(item.id));

  actions.append(removeBtn);
  li.append(num, titleBlock, actions);
  return li;
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// Heartbeat hacia la principal para que detecte cierre del panel si ocurre.
window.setInterval(() => channel.postMessage({ type: 'panel:heartbeat' }), 4000);
window.addEventListener('beforeunload', () => {
  try { channel.postMessage({ type: 'panel:bye' }); } catch { /* noop */ }
});
