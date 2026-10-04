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

/** Devuelve el HTML con el script puente antes de </body> (o al final). */
export function injectDeckBridge(html) {
  const tag = `<script>${BRIDGE_SCRIPT}</script>`;
  const bodyClose = html.toLowerCase().lastIndexOf('</body>');
  if (bodyClose === -1) return html + tag;
  return html.slice(0, bodyClose) + tag + html.slice(bodyClose);
}

/** 'open-notes' si el mensaje es una petición del script puente, o null. */
export function bridgeRequestFromMessage(data) {
  let message;
  try { message = typeof data === 'string' ? JSON.parse(data) : null; } catch { return null; }
  if (message?.namespace !== BRIDGE_NAMESPACE) return null;
  return message.type === OPEN_NOTES ? OPEN_NOTES : null;
}
