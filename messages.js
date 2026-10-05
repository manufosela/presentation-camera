/**
 * Catálogo de textos de la interfaz (CAM-TSK-0066): una clave por línea con
 * su texto en español y en inglés, juntos para no desincronizarlos.
 * i18n.test.js exige que toda clave tenga los dos idiomas.
 * Parámetros entre llaves: {name}.
 */
export const MESSAGES = {
  // Selector de idioma: muestra el idioma al que se cambia.
  'lang.switch': { es: 'EN', en: 'ES' },
  'lang.switchLabel': { es: 'Switch to English', en: 'Cambiar a español' },
};
