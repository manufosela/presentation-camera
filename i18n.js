/**
 * Idioma de la interfaz, inglés o español (CAM-TSK-0066).
 *
 * Sin elección guardada se usa el del navegador (español si empieza por "es",
 * si no inglés). Los textos del HTML se marcan con data-i18n="clave" (texto) y
 * data-i18n-attr="atributo:clave,..." (aria-label, title, placeholder…); los
 * del JS piden t('clave', { parámetros }). Una clave que no existe lanza: un
 * texto sin traducir es un fallo, no se muestra la clave en silencio.
 */

import { MESSAGES } from './messages.js';
import { STORAGE_KEYS } from './constants.js';

export const LANGS = Object.freeze(['es', 'en']);

let current = 'en';
const listeners = [];

/** Idioma guardado, o el preferido del navegador (el primero de la lista). */
export function detectLang(storage, languages) {
  let stored = null;
  try { stored = storage.getItem(STORAGE_KEYS.lang); } catch { /* sin almacenamiento */ }
  if (LANGS.includes(stored)) return stored;
  return languages[0]?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export const getLang = () => current;

/** Cambia el idioma, lo recuerda (si se puede) y avisa a quien escuche. */
export function setLang(lang, storage) {
  if (!LANGS.includes(lang)) throw new Error(`Idioma no soportado: ${lang}`);
  current = lang;
  try { storage?.setItem(STORAGE_KEYS.lang, lang); } catch { /* sin almacenamiento: no se recuerda */ }
  document.documentElement.lang = lang;
  listeners.forEach(listener => listener(lang));
}

export function onLangChange(listener) {
  listeners.push(listener);
}

export function t(key, params = {}) {
  const entry = MESSAGES[key];
  if (!entry) throw new Error(`Falta el texto «${key}» en messages.js`);
  return entry[current].replaceAll(/\{(\w+)\}/g, (match, name) => String(params[name] ?? match));
}

/** Traduce los elementos marcados con data-i18n / data-i18n-attr. */
export function translateDom(root = document) {
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of element.dataset.i18nAttr.split(',')) {
      const [attribute, key] = pair.split(':').map(part => part.trim());
      element.setAttribute(attribute, t(key));
    }
  }
}
