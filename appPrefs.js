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
