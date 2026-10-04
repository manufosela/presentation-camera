/**
 * Script puente para los decks HTML locales.
 *
 * Cuando el foco está dentro del deck (tras hacer clic en él), las teclas no
 * llegan a la app: la S la recibe reveal.js, cuyo plugin de notas intenta abrir
 * una ventana que el sandbox bloquea (y que con blob URLs tampoco funcionaría,
 * CAM-BUG-0013). Al servir el .html local, la app le inyecta este script: con S
 * avisa a la app por postMessage para que abra el panel de notas, y frena el
 * atajo del deck. Corre dentro del iframe aislado: no da acceso a la app.
 */

export const BRIDGE_NAMESPACE = 'presentation-camera';

const OPEN_NOTES = 'open-notes';

// Se ejecuta en el deck; sin dependencias ni sintaxis moderna obligatoria.
const BRIDGE_SCRIPT = `(function () {
  window.addEventListener('keydown', function (event) {
    var isS = event.key === 's' || event.key === 'S';
    if (!isS || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.parent.postMessage(JSON.stringify({ namespace: '${BRIDGE_NAMESPACE}', type: '${OPEN_NOTES}' }), '*');
  }, true);
})();`;

/**
 * Devuelve el HTML con el script puente añadido al final del documento. Nunca
 * se busca "</body>" en el texto: un deck puede contenerlo dentro de su propio
 * JS (p. ej. el plugin de notas incrustado) y la inserción partiría ese script
 * (CAM-BUG-0015). Al final del todo, el parser HTML lo coloca en el body.
 */
export function injectDeckBridge(html) {
  return `${html}<script>${BRIDGE_SCRIPT}</script>`;
}

/** 'open-notes' si el mensaje es una petición del script puente, o null. */
export function bridgeRequestFromMessage(data) {
  let message;
  try { message = typeof data === 'string' ? JSON.parse(data) : null; } catch { return null; }
  if (message?.namespace !== BRIDGE_NAMESPACE) return null;
  return message.type === OPEN_NOTES ? OPEN_NOTES : null;
}
