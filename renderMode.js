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
]);

/** true si el estilo necesita el bucle de dibujo en canvas. */
export function needsCanvasLoop(style) {
  if (!LOOP_BY_STYLE.has(style)) throw new Error(`Estilo de cámara desconocido: ${style}`);
  return LOOP_BY_STYLE.get(style);
}
