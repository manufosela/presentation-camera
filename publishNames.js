/**
 * Nombres de la URL pública onsli.de/<usuario>/<deck> (ADR 0002, CAM-TSK-0174).
 *
 * Las mismas reglas que firestore.rules y storage.rules, para avisar antes de
 * llamar a Firebase. Los errores son claves de messages.js.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/;
const MAX_LENGTH = 30;

// Carpetas y páginas del sitio: un usuario con ese nombre quedaría tapado.
const RESERVED_USERNAMES = new Set(['vendor', 'vendor-dl', 'models', 'poc', 'docs',
  'index', 'panel', 'privacy', 'remote', 'terms', 'empresa', 'admin', 'api', 'www', 'onslide']);

export const deckNameError = name => (SLUG.test(name) ? null : 'publish.invalidName');

export function usernameError(name) {
  return deckNameError(name) ?? (RESERVED_USERNAMES.has(name) ? 'publish.reservedName' : null);
}

/** Nombre de deck a partir de un título: sin tildes, en minúsculas y con guiones. */
export function suggestDeckName(title) {
  return title
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_LENGTH)
    .replaceAll(/(^-+)|(-+$)/g, '');
}

export const publicDeckUrl = (origin, username, deck) => `${origin}/${username}/${deck}`;
