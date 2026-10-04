/**
 * Navegación del deck desde la ventana principal.
 *
 * Con el foco en la app (no en el iframe), las teclas de navegación deben
 * mover las slides, no la cámara. Las presentaciones son cross-origin, así que
 * no se pueden despachar eventos de teclado dentro del iframe: se usa la API
 * postMessage de reveal.js (activa por defecto, config `postMessage: true`).
 * Para decks que no son reveal.js el mensaje se ignora sin efecto.
 */

const KEY_TO_METHOD = new Map([
  ['ArrowRight', 'right'],
  ['ArrowLeft', 'left'],
  ['ArrowDown', 'down'],
  ['ArrowUp', 'up'],
  ['PageDown', 'next'],
  ['PageUp', 'prev'],
  ['b', 'togglePause'],
  ['B', 'togglePause'],
  ['.', 'togglePause'],
  // Esc es la vista general en reveal.js; nunca debe terminar la sesión.
  ['Escape', 'toggleOverview'],
]);

/** Devuelve el comando reveal.js `{ method, args }` para la tecla, o null si no es del deck. */
export function deckCommandForKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === ' ') return { method: event.shiftKey ? 'prev' : 'next', args: [] };
  // Notas del ponente: el plugin de notas no está en la API postMessage, así que
  // se simula su tecla dentro del deck (keyCode 83 = S).
  if (event.key === 's' || event.key === 'S') return { method: 'triggerKey', args: [83] };
  if (event.key === 'Home') return { method: 'slide', args: [0] };
  if (event.key === 'End') return { method: 'slide', args: [Number.MAX_SAFE_INTEGER] };
  const method = KEY_TO_METHOD.get(event.key);
  return method ? { method, args: [] } : null;
}

/** Envía el comando al iframe del deck. Devuelve false si el iframe no está listo. */
export function sendDeckCommand(frame, command) {
  const target = frame?.contentWindow;
  if (!target) return false;
  target.postMessage(JSON.stringify(command), '*');
  return true;
}
