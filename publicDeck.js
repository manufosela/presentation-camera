/**
 * Deck publicado en onsli.de/<usuario>/<deck> (ADR 0002, CAM-TSK-0176).
 *
 * Lo usa el visor de 404.html, sin SDK ni apiKey: usernames/{usuario} es de
 * lectura pública en Firestore (REST) y el deck se descarga de Storage. Un
 * usuario o deck inexistente da null; cualquier otro fallo se lanza, para no
 * mostrar «no encontrado» cuando lo que falla es la red.
 */

import { deckNameError, usernameError } from './publishNames.js';

const DATABASE = 'projects/precam-app/databases/(default)';
const FIRESTORE = `https://firestore.googleapis.com/v1/${DATABASE}/documents`;
const MAX_REASON = 500;
const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/precam-app.firebasestorage.app/o';

/** { username, deck } de una ruta /<usuario>/<deck>, o null si no lo es. */
export function parseDeckPath(pathname) {
  const parts = pathname.replace(/\/$/, '').split('/').slice(1);
  if (parts.length !== 2) return null;
  const [username, deck] = parts;
  return usernameError(username) || deckNameError(deck) ? null : { username, deck };
}

async function fetchOrNull(fetchImpl, url, read) {
  const response = await fetchImpl(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  return read(response);
}

/** HTML del deck publicado, o null si el usuario o el deck no existen. */
export async function loadPublishedDeck({ username, deck }, fetchImpl = globalThis.fetch) {
  const owner = await fetchOrNull(fetchImpl, `${FIRESTORE}/usernames/${username}`, response => response.json());
  if (!owner) return null;
  const path = encodeURIComponent(`decks/${owner.fields.uid.stringValue}/${deck}.html`);
  return fetchOrNull(fetchImpl, `${STORAGE}/${path}?alt=media`, response => response.text());
}

/**
 * Guarda una denuncia en reports (CAM-TSK-0181). Va por :commit porque las
 * reglas exigen createdAt == request.time, que solo pone el servidor.
 */
export async function reportDeck({ username, deck, reason }, fetchImpl = globalThis.fetch) {
  const text = reason.trim();
  if (!text || text.length > MAX_REASON) throw new Error('viewer.reportInvalid');
  const write = {
    update: {
      name: `${DATABASE}/documents/reports/${crypto.randomUUID()}`,
      fields: { username: { stringValue: username }, deck: { stringValue: deck }, reason: { stringValue: text } },
    },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: false },
  };
  const response = await fetchImpl(`${FIRESTORE}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [write] }),
  });
  if (!response.ok) throw new Error(`reports → ${response.status}`);
}
