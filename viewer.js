/**
 * Visor público de onsli.de/<usuario>/<deck> (ADR 0002, CAM-TSK-0180).
 *
 * El deck es HTML de un usuario: se pinta en un iframe con sandbox
 * allow-scripts y sin allow-same-origin, así que corre en un origin opaco y no
 * alcanza nada de onsli.de. Cualquier otra ruta inexistente ve «no encontrado».
 */

import './frameGuard.js';
import { initI18n, t } from './i18n.js';
import { loadPublishedDeck, parseDeckPath } from './publicDeck.js';

initI18n({ storage: globalThis.localStorage, languages: navigator.languages, button: document.getElementById('langBtn') });

const status = document.getElementById('viewerStatus');
const frame = document.getElementById('viewerFrame');

const showStatus = key => {
  status.dataset.i18n = key;
  status.textContent = t(key);
};

async function show() {
  const target = parseDeckPath(location.pathname);
  if (!target) return showStatus('viewer.notFound');
  document.getElementById('viewerName').textContent = `${target.username} / ${target.deck}`;
  document.title = `${target.deck} · onslide`;
  try {
    const html = await loadPublishedDeck(target);
    if (html === null) return showStatus('viewer.notFound');
    frame.src = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    frame.hidden = false;
    status.hidden = true;
    frame.focus();
  } catch (error) {
    console.error('[viewer]', error);
    showStatus('viewer.failed');
  }
}

await show();
