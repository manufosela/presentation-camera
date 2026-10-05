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

  // Documento
  'doc.title': { es: 'Presentation Camera — tú, encima de tus slides', en: 'Presentation Camera — yourself, on top of any slides' },
  'doc.description': { es: 'Superpón tu cámara sobre cualquier presentación. Para docentes, streamers y cualquiera harto de los collages de Zoom.', en: 'Overlay your webcam on top of any embedded presentation. Built for teachers, streamers and anyone tired of awkward Zoom collages.' },

  // Controles durante la presentación
  'live.badge': { es: 'EN VIVO', en: 'LIVE' },
  'rec.title': { es: 'Grabar / detener (R)', en: 'Record / stop (R)' },
  'fullscreen.label': { es: 'Pantalla completa', en: 'Fullscreen' },
  'fullscreen.title': { es: 'Pantalla completa (F)', en: 'Fullscreen (F)' },
  'end.label': { es: 'Salir', en: 'End' },
  'end.title': { es: 'Volver al setup', en: 'Back to setup' },
  'showChrome.title': { es: 'Mostrar controles (H)', en: 'Show controls (H)' },
  'showChrome.label': { es: 'Mostrar controles', en: 'Show controls' },
  'webcam.videoLabel': { es: 'Vídeo del presentador', en: 'Presenter video' },
  'webcam.tools': { es: 'Controles de la cámara', en: 'Webcam controls' },
  'webcam.move.title': { es: 'Cambiar de esquina (C)', en: 'Move to the next corner (C)' },
  'webcam.move.label': { es: 'Cambiar de esquina', en: 'Move to the next corner' },
  'webcam.style.title': { es: 'Alternar marco y recorte (M)', en: 'Toggle framed and cut-out (M)' },
  'webcam.style.label': { es: 'Alternar marco y recorte', en: 'Toggle framed and cut-out' },

  // Cabecera y portada del setup
  'topbar.offAir': { es: 'sin emitir', en: 'off air' },
  'topbar.help': { es: 'ayuda ?', en: 'help ?' },
  'topbar.helpTitle': { es: 'Ayuda / primeros pasos', en: 'Help / getting started' },
  'topbar.source': { es: 'código ↗', en: 'source ↗' },
  'hero.eyebrow': { es: 'una pequeña cabina de emisión', en: 'a tiny broadcast booth' },
  'hero.title1': { es: 'Pon tu cara', en: 'Put your face' },
  'hero.titleEm': { es: 'encima', en: 'on top' },
  'hero.title2': { es: 'de cualquier presentación.', en: 'of any slides.' },
  'hero.lede': { es: 'Incrusta una presentación, ponte en una esquina y quita el fondo si quieres. Una tecla para moverte, otra para desaparecer. Todo se queda en tu navegador.', en: 'Embed a presentation, drop yourself into the corner, cut the background if you want. Press one key to move, another to vanish. Everything stays in your browser.' },

  // Sección 01: presentaciones
  'sources.title': { es: 'Presentaciones', en: 'Source slides' },
  'sources.demo': { es: 'o prueba una demo', en: 'or try a demo' },
  'sources.loadHtml': { es: 'Cargar HTML local (un .html)', en: 'Load local HTML (one .html)' },
  'sources.loadFolder': { es: 'Cargar carpeta HTML (con recursos)', en: 'Load HTML folder (with assets)' },
  'sources.localHelp': { es: 'Un único .html autocontenido, o una carpeta exportada (reveal, impress, slides.to) con su index.html y sus recursos. Se guarda en tu navegador: no se sube a ningún sitio.', en: 'A single self-contained .html, or an exported folder (reveal, impress, slides.to) with its index.html and assets. It is stored in your browser: nothing is uploaded.' },
  'sources.saved': { es: 'Presentaciones guardadas', en: 'Saved presentations' },
  'sources.savedEmpty': { es: 'Aún no hay ninguna. Pega una URL o carga un HTML local.', en: 'None yet. Paste a URL or load a local HTML.' },
  'sources.openPanel': { es: 'Abrir panel de control', en: 'Open control panel' },
  'sources.panelHelp': { es: 'Otra ventana del navegador con tus presentaciones en pequeño. Tenla en otro monitor y comparte solo esta en Zoom/Meet/Teams.', en: 'A separate browser window with your presentations in small. Keep it on another screen and share only this one in Zoom/Meet/Teams.' },
};
