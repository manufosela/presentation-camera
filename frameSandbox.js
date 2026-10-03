/**
 * Atributo `sandbox` de los iframes de presentación.
 *
 * Un HTML local se sirve como blob URL, que hereda el origin de la app: sin
 * sandbox, el JS del deck podría leer localStorage, el OPFS (grabaciones) y
 * hablar con el Service Worker. Con `allow-scripts` y SIN `allow-same-origin`
 * el deck corre en un origin opaco y queda aislado; la navegación por
 * postMessage de reveal.js sigue funcionando.
 *
 * Los bundles (carpetas) los sirve el Service Worker desde OPFS, y el SW no
 * controla iframes de origin opaco: con sandbox darían 404. Quedan sin sandbox
 * hasta tener otra forma de servirlos.
 */

/** Devuelve el valor del atributo sandbox para la source, o null si no se aplica. */
export function sandboxForSource(source) {
  if (source.type === 'html' && !source.bundle) return 'allow-scripts';
  return null;
}
