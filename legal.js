/**
 * Páginas legales (CAM-TSK-0137): cada una trae el texto en español e inglés;
 * se ve el del idioma de la app (o del navegador) y se puede cambiar.
 */

import { detectLang, LANGS } from './i18n.js';
import { STORAGE_KEYS } from './constants.js';

export function showLegalLang(doc, lang) {
  for (const article of doc.querySelectorAll('article[lang]')) article.hidden = article.lang !== lang;
  doc.documentElement.lang = lang;
}

if (globalThis.document?.querySelector('[data-legal-lang]')) {
  let storage = null; // localStorage puede lanzar en modo privado
  try { storage = globalThis.localStorage; } catch { /* se sigue al navegador */ }
  showLegalLang(document, detectLang(storage, navigator.languages));
  for (const button of document.querySelectorAll('[data-legal-lang]')) {
    button.addEventListener('click', () => {
      const lang = button.dataset.legalLang;
      if (!LANGS.includes(lang)) return;
      try { storage?.setItem(STORAGE_KEYS.lang, lang); } catch { /* sin almacenamiento: no se recuerda */ }
      showLegalLang(document, lang);
    });
  }
}
