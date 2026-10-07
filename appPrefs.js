/**
 * Preferencias locales de la app que no deben viajar en la URL.
 *
 * - La cámara elegida (deviceId) es un identificador persistente del hardware:
 *   en la query string se filtraba al compartir o copiar el enlace.
 * - window.__cam (store y canal expuestos para depurar) solo con ?debug=1.
 */

import { STORAGE_KEYS } from './constants.js';

export const CAMERA_KEY = STORAGE_KEYS.camera;

/** true si la URL lleva ?debug=1. */
export function isDebugEnabled(search) {
  return new URLSearchParams(search).get('debug') === '1';
}

/** deviceId guardado, o null si se usa la cámara automática. */
export function loadCameraId(storage) {
  return storage.getItem(CAMERA_KEY);
}

/** Guarda el deviceId; null borra la preferencia (cámara automática). */
export function saveCameraId(storage, deviceId) {
  if (deviceId) storage.setItem(CAMERA_KEY, deviceId);
  else storage.removeItem(CAMERA_KEY);
}

// Micrófono elegido (CAM-TSK-0101); null = el predeterminado del sistema.
const MIC_KEY = STORAGE_KEYS.mic;

export function loadMicId(storage) {
  return storage.getItem(MIC_KEY);
}

export function saveMicId(storage, deviceId) {
  if (deviceId) storage.setItem(MIC_KEY, deviceId);
  else storage.removeItem(MIC_KEY);
}

// Fondo elegido para el recorte (id de backgroundStore); null = sin fondo.
const BACKGROUND_KEY = STORAGE_KEYS.background;

export function loadBackgroundId(storage) {
  return storage.getItem(BACKGROUND_KEY);
}

export function saveBackgroundId(storage, id) {
  if (id) storage.setItem(BACKGROUND_KEY, id);
  else storage.removeItem(BACKGROUND_KEY);
}

// Atajos de una sola tecla (C, M, R, F, H, S, \, 1-9): desactivables para que
// el dictado por voz no dispare acciones (WCAG 2.1.4). Activados por defecto.
const SINGLE_KEY_SHORTCUTS_KEY = STORAGE_KEYS.singleKeyShortcuts;

/** false solo si el usuario los desactivó. */
export function loadSingleKeyShortcuts(storage) {
  return storage.getItem(SINGLE_KEY_SHORTCUTS_KEY) !== 'false';
}

export function saveSingleKeyShortcuts(storage, enabled) {
  storage.setItem(SINGLE_KEY_SHORTCUTS_KEY, String(enabled));
}

// Subtítulos (CAM-TSK-0113): activados, idioma en que se habla y al que traducir
// (null = sin traducir). Se validan campo a campo: lo desconocido vuelve al valor
// por defecto al leer y es un error al guardar.
const CAPTIONS_KEY = STORAGE_KEYS.captions;
export const CAPTION_LANGS = Object.freeze(['es', 'en']);

function validCaptionPrefs({ enabled, spoken, translateTo }, uiLang) {
  const lang = CAPTION_LANGS.includes(spoken) ? spoken : uiLang;
  return {
    enabled: enabled === true,
    spoken: lang,
    translateTo: CAPTION_LANGS.includes(translateTo) && translateTo !== lang ? translateTo : null,
  };
}

/** Preferencias de subtítulos; `uiLang` es el idioma hablado por defecto. */
export function loadCaptionPrefs(storage, uiLang) {
  let saved = {};
  try {
    saved = JSON.parse(storage.getItem(CAPTIONS_KEY) ?? '{}') ?? {};
  } catch {
    saved = {}; // guardado roto: valores por defecto
  }
  return validCaptionPrefs(saved, uiLang);
}

export function saveCaptionPrefs(storage, prefs) {
  if (!CAPTION_LANGS.includes(prefs.spoken)) throw new Error(`idioma de subtítulos no válido: ${prefs.spoken}`);
  if (prefs.translateTo !== null && !CAPTION_LANGS.includes(prefs.translateTo)) {
    throw new Error(`idioma de traducción no válido: ${prefs.translateTo}`);
  }
  storage.setItem(CAPTIONS_KEY, JSON.stringify(validCaptionPrefs(prefs, prefs.spoken)));
}

// Cámara en espejo: natural para quien presenta, pero la grabación (captura de
// la pantalla) sale igual que se ve. Desactivable para grabar al derecho.
const MIRROR_KEY = STORAGE_KEYS.mirror;

/** false solo si el usuario quitó el espejo. */
export function loadMirror(storage) {
  return storage.getItem(MIRROR_KEY) !== 'false';
}

export function saveMirror(storage, mirrored) {
  storage.setItem(MIRROR_KEY, String(mirrored));
}
