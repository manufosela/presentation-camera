/**
 * Enlace entre la ventana principal y el panel de control sobre el
 * BroadcastChannel compartido, y el atajo 1-9 que ambas ventanas usan.
 *
 * Protocolo de presencia:
 *   - Cada ventana saluda al arrancar (main:hello / panel:hello).
 *   - La que recibe el saludo responde (main:heartbeat / panel:hello-ack).
 *   - Mientras siguen abiertas, laten cada 4 s; al cerrarse se despiden (bye).
 *   - El panel marca "lost" si la principal se despide, no responde en 8 s o
 *     deja de latir 12 s.
 */

/** Índice de fuente (0..8) para las teclas 1-9, o null si no aplica. */
export function sourceIndexForKey(event, sourceCount) {
  if (event.target?.closest?.('input, textarea, select, [contenteditable]')) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (!/^[1-9]$/.test(event.key)) return null;
  const index = Number(event.key) - 1;
  return index < sourceCount ? index : null;
}

/** Lado de la ventana principal. */
export function startMainLink(channel, { heartbeatMs = 4000 } = {}) {
  let linked = false;
  const onMessage = ({ data }) => {
    switch (data?.type) {
      case 'panel:hello':
      case 'panel:heartbeat':
        linked = true;
        channel.postMessage({ type: 'main:heartbeat' });
        break;
      case 'panel:hello-ack':
        linked = true;
        break;
      case 'panel:bye':
        linked = false;
        break;
      default:
        break;
    }
  };
  channel.addEventListener('message', onMessage);
  channel.postMessage({ type: 'main:hello' });
  const heartbeat = setInterval(() => {
    if (linked) channel.postMessage({ type: 'main:heartbeat' });
  }, heartbeatMs);
  return {
    isLinked: () => linked,
    bye: () => channel.postMessage({ type: 'main:bye' }),
    dispose() {
      clearInterval(heartbeat);
      channel.removeEventListener('message', onMessage);
    },
  };
}

/** Lado del panel. `onState` recibe 'linked' o 'lost'. */
export function startPanelLink(channel, onState, { heartbeatMs = 4000, ackTimeoutMs = 8000, lostAfterMs = 12000 } = {}) {
  let linked = false;
  let watchdog = null;
  const markLinked = () => {
    linked = true;
    clearTimeout(watchdog);
    onState('linked');
    watchdog = setTimeout(() => {
      linked = false;
      onState('lost');
    }, lostAfterMs);
  };
  const onMessage = ({ data }) => {
    switch (data?.type) {
      case 'main:hello':
        // La ventana principal acaba de saludar — confirmamos.
        channel.postMessage({ type: 'panel:hello-ack' });
        markLinked();
        break;
      case 'main:heartbeat':
        markLinked();
        break;
      case 'main:bye':
        // Cierre limpio de la principal: avisar ya, sin esperar al vigilante.
        clearTimeout(watchdog);
        linked = false;
        onState('lost');
        break;
      default:
        break;
    }
  };
  channel.addEventListener('message', onMessage);
  // Si la principal no está abierta aún, el enlace llegará con su hello.
  channel.postMessage({ type: 'panel:hello' });
  if (!linked) {
    watchdog = setTimeout(() => {
      if (!linked) onState('lost');
    }, ackTimeoutMs);
  }
  const heartbeat = setInterval(() => channel.postMessage({ type: 'panel:heartbeat' }), heartbeatMs);
  return {
    isLinked: () => linked,
    bye: () => channel.postMessage({ type: 'panel:bye' }),
    dispose() {
      clearInterval(heartbeat);
      clearTimeout(watchdog);
      channel.removeEventListener('message', onMessage);
    },
  };
}
