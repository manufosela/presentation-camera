import { describe, expect, it } from 'vitest';
import {
  REMOTE_TTL_MS, createRemoteSession, createSessionId, deckCommandForRemote, isSessionId, remoteUrl, sessionIdFromHash,
} from './remoteSession.js';

describe('id de sesión del mando (CAM-TSK-0167)', () => {
  it('son 128 bits aleatorios en base64url: 22 caracteres sin relleno', () => {
    const id = createSessionId(() => new Uint8Array(16).fill(255));
    expect(id).toBe('_____________________w');
    expect(isSessionId(id)).toBe(true);
  });

  it('dos ids seguidos no coinciden', () => {
    expect(createSessionId()).not.toBe(createSessionId());
  });

  it.each(['', 'corto', 'a'.repeat(23), `${'a'.repeat(21)}=`, `${'a'.repeat(21)}/`, null])('rechaza %s', value => {
    expect(isSessionId(value)).toBe(false);
  });
});

describe('URL del mando', () => {
  const id = 'abcdefghijklmnopqrstuv';

  it('el id va en el fragmento, que no viaja en las peticiones HTTP', () => {
    expect(remoteUrl('https://onsli.de/', id)).toBe(`https://onsli.de/remote.html#${id}`);
  });

  it('respeta una subruta de publicación', () => {
    expect(remoteUrl('https://x.github.io/presentation-camera/index.html', id))
      .toBe(`https://x.github.io/presentation-camera/remote.html#${id}`);
  });

  it('lee el id del fragmento y rechaza uno mal formado', () => {
    expect(sessionIdFromHash(`#${id}`)).toBe(id);
    expect(sessionIdFromHash('#<script>')).toBeNull();
    expect(sessionIdFromHash('')).toBeNull();
  });
});

describe('nodo inicial de la sesión', () => {
  it('caduca a las 12 h y nace sin comandos', () => {
    const session = createRemoteSession(1000);
    expect(REMOTE_TTL_MS).toBe(12 * 3600 * 1000);
    expect(session).toEqual({ createdAt: 1000, expiresAt: 1000 + REMOTE_TTL_MS, desktop: { online: true } });
  });
});

describe('comandos del mando → comando de deck', () => {
  it.each([
    ['next', { method: 'next', args: [] }],
    ['prev', { method: 'prev', args: [] }],
    ['first', { method: 'slide', args: [0] }],
    ['last', { method: 'slide', args: [Number.MAX_SAFE_INTEGER] }],
    ['blackout', { method: 'togglePause', args: [] }],
  ])('%s', (name, command) => {
    expect(deckCommandForRemote({ seq: 1, name, sentAt: 5 })).toEqual(command);
  });

  it.each([
    { seq: 1, name: 'eval', sentAt: 5 },
    { seq: 1, name: 'toString', sentAt: 5 },
    { name: 'next' },
    null,
    'next',
  ])('ignora lo que no es de la lista cerrada: %j', command => {
    expect(deckCommandForRemote(command)).toBeNull();
  });
});
