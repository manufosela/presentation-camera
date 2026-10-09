/**
 * Nombres de cada grabación en el Drive de la empresa (ADR 0001 §5,
 * CAM-TSK-0150): carpeta «AAAA-MM-DD Ponente» (fecha de Madrid) dentro del
 * evento y fichero «Título.webm|mp4». Lo que escribe el ponente se limpia:
 * sin caracteres de control ni barras, espacios normalizados y con tope.
 */

import { AdminError } from './adminHandlers.js';

const EXTENSIONS = [['video/webm', 'webm'], ['video/mp4', 'mp4']];
const madridDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });

function clean(text, max) {
  return String(text ?? '')
    .replaceAll(/\p{Cc}/gu, '')
    .replaceAll(/[/\\]/g, '-')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export function uploadNames({ speaker, title, mimeType, nowMs }) {
  const extension = EXTENSIONS.find(([type]) => String(mimeType).startsWith(type))?.[1];
  if (!extension) throw new AdminError('invalid-argument', 'mimeType: solo video/webm o video/mp4.');
  return {
    folder: `${madridDate.format(nowMs)} ${clean(speaker, 80) || 'Ponente'}`,
    file: `${clean(title, 100) || 'Grabación'}.${extension}`,
  };
}
