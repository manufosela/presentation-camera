/**
 * Visor público de onsli.de/<usuario>/<deck> (ADR 0002, CAM-TSK-0180).
 *
 * El deck es HTML de un usuario: se pinta en un iframe con sandbox
 * allow-scripts y sin allow-same-origin, así que corre en un origin opaco y no
 * alcanza nada de onsli.de. Cualquier otra ruta inexistente ve «no encontrado».
 */

import './frameGuard.js';
import { initI18n, t } from './i18n.js';
import { loadPublishedDeck, parseDeckPath, reportDeck } from './publicDeck.js';

initI18n({ storage: globalThis.localStorage, languages: navigator.languages, button: document.getElementById('langBtn') });

const status = document.getElementById('viewerStatus');
const frame = document.getElementById('viewerFrame');

const showStatus = key => {
  status.dataset.i18n = key;
  status.textContent = t(key);
};

/** Botón «Denunciar» (CAM-TSK-0181): el motivo va a reports para que onslide lo revise. */
function enableReport(target) {
  const dialog = document.getElementById('reportDialog');
  const form = document.getElementById('reportForm');
  const reason = document.getElementById('reportReason');
  const reportStatus = document.getElementById('reportStatus');
  const send = document.getElementById('reportSend');
  const open = document.getElementById('reportOpen');
  open.hidden = false;
  open.addEventListener('click', () => {
    reportStatus.value = '';
    dialog.showModal();
  });
  document.getElementById('reportCancel').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    send.disabled = true;
    try {
      await reportDeck({ ...target, reason: reason.value });
      reportStatus.value = t('viewer.reportSent');
      reason.value = ''; // form.reset() también vaciaría el <output> con el aviso
    } catch (error) {
      console.error('[viewer] denuncia', error);
      reportStatus.value = t(error.message === 'viewer.reportInvalid' ? 'viewer.reportInvalid' : 'viewer.reportFailed');
    } finally {
      send.disabled = false;
    }
  });
}

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
    enableReport(target);
    frame.focus();
  } catch (error) {
    console.error('[viewer]', error);
    showStatus('viewer.failed');
  }
}

await show();
