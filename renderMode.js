/**
 * Modo de render del overlay de cámara.
 *
 * En "frame" el <video> se muestra tal cual (CSS lo espeja y redondea): no hay
 * bucle de dibujo ni coste de CPU por frame. Solo "cutout" necesita el canvas,
 * porque compone cada frame con la máscara de BodyPix.
 */

const LOOP_BY_STYLE = new Map([
  ['frame', false],
  ['cutout', true],
  ['none', false], // sin cámara: solo slides y audio (CAM-TSK-0050)
]);

function assertKnown(style) {
  if (!LOOP_BY_STYLE.has(style)) throw new Error(`Estilo de cámara desconocido: ${style}`);
}

/** true si el estilo necesita el bucle de dibujo en canvas. */
export function needsCanvasLoop(style) {
  assertKnown(style);
  return LOOP_BY_STYLE.get(style);
}

/** false en «sin cámara»: ni permiso de cámara ni recuadro. */
export function usesCamera(style) {
  assertKnown(style);
  return style !== 'none';
}

/** La tecla M alterna marco y recorte; «sin cámara» no cambia (no enciende la cámara). */
export function toggledStyle(style) {
  assertKnown(style);
  if (style === 'none') return style;
  return style === 'frame' ? 'cutout' : 'frame';
}
