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
 *
 * Las presentaciones remotas conservan su propio origin (allow-same-origin es
 * el de ELLAS, no el de la app) pero sin allow-top-navigation: una URL
 * maliciosa no puede redirigir la ventana principal en plena clase. Los
 * popups escapan del sandbox para que los enlaces del deck abran normales.
 */

const REMOTE_SANDBOX = [
  'allow-scripts',
  'allow-same-origin',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-forms',
  'allow-presentation',
].join(' ');

// Origin opaco: el contenido ejecuta JS pero no comparte origin con nadie.
const OPAQUE_SANDBOX = 'allow-scripts';

function isCrossOrigin(url, appOrigin) {
  try {
    return new URL(url).origin !== appOrigin;
  } catch {
    return false; // no parseable → se trata como no fiable (política opaca)
  }
}

/**
 * Devuelve el valor del atributo sandbox para la source, o null si no se aplica.
 * `appOrigin` es el origin de la app: una URL de ese mismo origin con
 * allow-scripts + allow-same-origin podría quitarse el sandbox, así que recibe
 * la política opaca.
 */
export function sandboxForSource(source, appOrigin) {
  if (source.type === 'html') return source.bundle ? null : OPAQUE_SANDBOX;
  return isCrossOrigin(source.url, appOrigin) ? REMOTE_SANDBOX : OPAQUE_SANDBOX;
}

/**
 * Origin con el que llegan los mensajes postMessage del deck: "null" si su
 * sandbox es opaco (sin allow-same-origin), el de la app para un bundle sin
 * sandbox y el de la URL para una remota.
 */
export function deckOrigin(source, appOrigin) {
  const sandbox = sandboxForSource(source, appOrigin);
  if (sandbox === null) return appOrigin;
  if (!sandbox.split(' ').includes('allow-same-origin')) return 'null';
  return new URL(source.url).origin;
}

/** Devuelve el atributo allow (Permissions Policy) del iframe, o null. */
export function allowForSource(source) {
  return source.type === 'html' ? null : 'fullscreen; autoplay';
}
