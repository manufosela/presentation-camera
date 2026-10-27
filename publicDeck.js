/**
 * Deck publicado en onsli.de/<usuario>/<deck> (ADR 0002, CAM-TSK-0176).
 *
 * Lo usa el visor de 404.html, sin SDK ni apiKey: usernames/{usuario} es de
 * lectura pública en Firestore (REST) y el deck se descarga de Storage. Un
 * usuario o deck inexistente da null; cualquier otro fallo se lanza, para no
 * mostrar «no encontrado» cuando lo que falla es la red.
 */

import { deckNameError, usernameError } from './publishNames.js';

const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/precam-app/databases/(default)/documents';
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
