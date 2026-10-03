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
