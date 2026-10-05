/**
 * Versión publicada de la app. La genera el workflow de Pages (CAM-TSK-0051)
 * en version.json; en local (sin publicar) no existe.
 */

import { t } from './i18n.js';

const isText = value => typeof value === 'string' && value.length > 0;

/** { version, commit, date } si version.json tiene la forma esperada, o null. */
export function parseVersion(data) {
  if (!data || !isText(data.version) || !isText(data.commit) || !isText(data.date)) return null;
  return { version: data.version, commit: data.commit, date: data.date };
}

/** Texto del pie: "v1.0.0 · abc1234 · 2026-10-04", o versión de desarrollo. */
export function formatVersion(info) {
  if (!info) return t('version.dev');
  return `v${info.version} · ${info.commit} · ${info.date}`;
}

/** Lee version.json; null si no existe (local), no es válido o no hay red. */
export async function loadVersion(fetchFn = fetch) {
  try {
    const response = await fetchFn('version.json');
    if (!response.ok) return null;
    return parseVersion(await response.json());
  } catch {
    return null;
  }
}
