/**
 * La app nunca se ejecuta dentro de un iframe.
 *
 * Las presentaciones remotas necesitan allow-same-origin en su sandbox (Google
 * Slides no carga sin él). Si un deck navegara su propio iframe a una página
 * de la app, esa página tendría el origin de la app y podría alcanzar al padre.
 * Importado el PRIMERO por precam.js y panel.js: al lanzar aquí, el grafo de
 * módulos entero aborta y ningún código de la app llega a ejecutarse.
 */

export function assertTopLevel(win) {
  if (win.top !== win.self) {
    throw new Error('onslide no se ejecuta dentro de un iframe.');
  }
}

if (typeof window !== 'undefined') assertTopLevel(window);
