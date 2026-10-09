/**
 * Fin de carga del deck activo (CAM-BUG-0023): «Cargando presentación…» se
 * quita al cargar el deck, no al arrancar la cámara (sin cámara no se iba).
 * Se ignora el about:blank que dispara un iframe local antes de tener src.
 */

export function onActiveDeckLoaded(frame, done) {
  frame.addEventListener('load', () => {
    if (frame.getAttribute('src') && frame.classList.contains('is-active')) done();
  });
}
