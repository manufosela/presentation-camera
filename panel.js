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

sources.subscribe(state => {
  renderList(state);
});

function renderList({ list: items, activeIndex }) {
  if (!list || !hint) return;
  hint.hidden = items.length > 0;
  list.replaceChildren(...items.map((item, index) => renderSource(item, index, activeIndex)));
}

function renderSource(item, index, activeIndex) {
  const isActive = index === activeIndex;

  const li = document.createElement('li');
  li.className = 'panel-source';
  li.dataset.active = String(isActive);
  li.dataset.id = item.id;

  const num = document.createElement('span');
  num.className = 'panel-source-num';
  num.textContent = String(index + 1);

  // Bloque central: nombre editable + URL
  const titleBlock = document.createElement('div');
  titleBlock.className = 'panel-source-title';

  const name = document.createElement('span');
  name.className = 'panel-source-name';
  name.title = 'Doble click para editar';
  name.textContent = item.title || hostnameOf(item.url);
  setupInlineEdit(name, item);

  const urlEl = document.createElement('a');
  urlEl.className = 'panel-source-url';
  urlEl.href = item.url;
  urlEl.target = '_blank';
  urlEl.rel = 'noopener noreferrer';
  urlEl.textContent = item.url;
  urlEl.title = 'Abrir en pestaña nueva';

  titleBlock.append(name, urlEl);

  // Acciones
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
  activateBtn.addEventListener('click', () => sources.setActiveById(item.id));

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'panel-source-btn panel-source-btn--danger';
  removeBtn.title = 'Quitar';
  removeBtn.setAttribute('aria-label', 'Quitar');
  removeBtn.innerHTML = '<svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  removeBtn.addEventListener('click', () => sources.remove(item.id));

  actions.append(activateBtn, removeBtn);
  li.append(num, titleBlock, actions);

  return li;
}

function setupInlineEdit(node, item) {
  let originalText = '';
  node.addEventListener('dblclick', () => {
    if (node.isContentEditable) return;
    originalText = node.textContent;
    node.contentEditable = 'true';
    node.spellcheck = false;
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });
  node.addEventListener('keydown', event => {
    if (!node.isContentEditable) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      node.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      node.textContent = originalText;
      node.blur();
    }
  });
  node.addEventListener('blur', () => {
    if (!node.isContentEditable) return;
    node.contentEditable = 'false';
    const raw = node.textContent.replace(/\s+/g, ' ').trim().slice(0, 80);
    const next = raw || null;
    node.textContent = next || hostnameOf(item.url);
    if (next !== item.title) sources.updateTitle(item.id, next);
  });
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
