/**
 * Contrato compartido entre la ventana principal, el panel y el almacenamiento.
 * Un rename parcial rompería la sincronización o perdería datos en silencio,
 * así que viven en un único sitio.
 */

/** BroadcastChannel entre la ventana principal y el panel de control. */
export const SYNC_CHANNEL = 'cam.sync';

/** Claves de localStorage. Ya existen en los navegadores de los usuarios: no cambiarlas. */
export const STORAGE_KEYS = Object.freeze({
  sources: 'cam.sources.v1',
  onboarded: 'cam.onboarded.v1',
  autoRecord: 'cam.autoRecord.v1',
  camera: 'cam.camera.v1',
  singleKeyShortcuts: 'cam.singleKeyShortcuts.v1',
  background: 'cam.background.v1',
  theme: 'cam.theme.v1', // también en theme.js (script clásico, no puede importar)
});
