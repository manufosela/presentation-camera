/**
 * Sesión del mando desde el móvil (CAM-TSK-0167, ADR 0001).
 *
 * El escritorio crea remote/{id} en Realtime Database y enseña un QR con
 * remote.html#{id}. El id es la llave (capability URL): 128 bits aleatorios
 * que viajan en el fragmento, nunca en una petición HTTP. Lo que llega del
 * móvil se valida contra una lista cerrada: nunca se ejecuta texto recibido.
 */

export const REMOTE_TTL_MS = 12 * 3600 * 1000;

const SESSION_ID = /^[\w-]{22}$/;

export function createSessionId(randomBytes = n => crypto.getRandomValues(new Uint8Array(n))) {
  // btoa y no Uint8Array#toBase64: este aún falta en Node 22 y en navegadores de 2024.
  return btoa(String.fromCharCode(...randomBytes(16))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export const isSessionId = value => typeof value === 'string' && SESSION_ID.test(value);

export const remoteUrl = (pageUrl, sessionId) => new URL(`remote.html#${sessionId}`, pageUrl).href;

export function sessionIdFromHash(hash) {
  const id = hash.slice(1);
  return isSessionId(id) ? id : null;
}

export const createRemoteSession = now => ({ createdAt: now, expiresAt: now + REMOTE_TTL_MS, desktop: { online: true } });

const DECK_COMMANDS = {
  next: { method: 'next', args: [] },
  prev: { method: 'prev', args: [] },
  first: { method: 'slide', args: [0] },
  last: { method: 'slide', args: [Number.MAX_SAFE_INTEGER] },
  blackout: { method: 'togglePause', args: [] },
};

export const REMOTE_COMMANDS = Object.keys(DECK_COMMANDS);

/** Comando de deck (formato reveal.js) para un comando del mando, o null si no es de la lista. */
export function deckCommandForRemote(command) {
  if (!Number.isInteger(command?.seq) || !Object.hasOwn(DECK_COMMANDS, command.name)) return null;
  return structuredClone(DECK_COMMANDS[command.name]);
}
