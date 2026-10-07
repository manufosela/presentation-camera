/**
 * Aviso de grabación sin terminar al abrir la app (CAM-TSK-0122): si el
 * navegador se cerró grabando, lo guardado (recordingStore.js) se ofrece para
 * descargarlo o descartarlo.
 */

import { getLang, t } from './i18n.js';

const UNITS = [['GB', 1024 ** 3], ['MB', 1024 ** 2], ['KB', 1024]];

/** Tamaño legible en el idioma actual: «125 MB», «2,5 GB». */
export function formatSize(bytes) {
  const [unit, factor] = UNITS.find(([, size]) => bytes >= size) ?? UNITS.at(-1);
  const value = new Intl.NumberFormat(getLang(), { maximumFractionDigits: 1 }).format(bytes / factor);
  return `${value} ${unit}`;
}

const formatDate = time => new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeStyle: 'short' }).format(time);

function button(label, onClick) {
  const element = Object.assign(document.createElement('button'), { type: 'button', className: 'row-btn', textContent: label });
  element.addEventListener('click', onClick);
  return element;
}

export function renderRecoveryNotice(container, sessions, { onDownload, onDiscard }) {
  container.replaceChildren(...sessions.map(session => {
    const item = document.createElement('div');
    item.className = 'recovery-item';
    const text = document.createElement('p');
    text.textContent = t('recover.text', { date: formatDate(session.startedAt), size: formatSize(session.size) });
    const actions = document.createElement('div');
    actions.className = 'recovery-actions';
    actions.append(button(t('recover.download'), () => onDownload(session)), button(t('recover.discard'), () => onDiscard(session)));
    item.append(text, actions);
    return item;
  }));
  container.hidden = sessions.length === 0;
}
