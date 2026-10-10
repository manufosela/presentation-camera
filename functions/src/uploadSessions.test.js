import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore } from '../../test-support/fakeFirestore.js';
import { generateEventCode } from './eventCodes.js';
import { createUploadSessions } from './uploadSessions.js';

const NOW = Date.UTC(2026, 9, 10, 9);
const at = ms => ({ toMillis: () => ms });
const { code, hash } = generateEventCode(() => new Uint8Array(16).fill(3));
const request = { org: 'acme', code, speaker: 'Ana Ruiz', title: 'Mi charla', mimeType: 'video/webm;codecs=vp9' };

let db;
let google;
let sessions;
beforeEach(() => {
  db = fakeFirestore({
    'orgSlugs/acme': { orgId: 'org1' },
    'orgs/org1': { name: 'Acme', status: 'active', limits: { sessionsPerDay: 2 }, drive: { connected: true } },
    'orgs/org1/private/drive': { ciphertext: 'sealed:rt' },
    'orgs/org1/events/ev1': { name: 'Congreso' },
    [`orgs/org1/codes/${hash}`]: { eventId: 'ev1', expiresAt: at(NOW + 3600_000), revoked: false, maxUploads: 5, uploads: 0 },
  });
  google = {
    refreshAccessToken: vi.fn(async () => 'at'),
    createFolder: vi.fn(async () => 'sessionFolder'),
    startResumableSession: vi.fn(async () => 'https://upload.test/s1'),
  };
  sessions = createUploadSessions({
    db, google, origin: 'https://onsli.de',
    unseal: sealed => sealed.ciphertext.replace('sealed:', ''),
    ensureFolder: vi.fn(async () => 'eventFolder'),
    now: () => NOW, timestamp: at, newId: () => 'up1',
  });
});

describe('createSession — subida con código de evento (CAM-TSK-0152)', () => {
  it('cuenta la subida, crea la carpeta de la sesión y devuelve solo la URI', async () => {
    expect(await sessions.createSession(null, request)).toEqual({
      uploadId: 'up1', sessionUri: 'https://upload.test/s1', orgName: 'Acme', eventName: 'Congreso',
    });
    expect(db.docs.get(`orgs/org1/codes/${hash}`).uploads).toBe(1);
    expect(db.docs.get('usage/org1_20261010')).toEqual({ sessions: 1 });
    expect(google.refreshAccessToken).toHaveBeenCalledWith('rt');
    expect(google.createFolder).toHaveBeenCalledWith('at', { name: '2026-10-10 Ana Ruiz', parentId: 'eventFolder' });
    expect(google.startResumableSession).toHaveBeenCalledWith('at', {
      name: 'Mi charla.webm', parentId: 'sessionFolder', mimeType: 'video/webm', origin: 'https://onsli.de', size: undefined,
    });
    expect(db.docs.get('orgs/org1/uploads/up1')).toMatchObject({ eventId: 'ev1', codeHash: hash, speaker: 'Ana Ruiz', status: 'open' });
  });

  const expectError = async (input, errorCode) => {
    await expect(sessions.createSession(null, input)).rejects.toMatchObject({ code: errorCode });
    expect(db.docs.get(`orgs/org1/codes/${hash}`).uploads).toBe(0); // no se cuenta nada
    expect(google.startResumableSession).not.toHaveBeenCalled();
  };

  it('rechaza un código desconocido, revocado o mal escrito', async () => {
    await expectError({ ...request, code: generateEventCode(() => new Uint8Array(16).fill(9)).code }, 'permission-denied');
    await expectError({ ...request, code: 'nope' }, 'invalid-argument');
    db.docs.get(`orgs/org1/codes/${hash}`).revoked = true;
    await expectError(request, 'permission-denied');
  });

  it('rechaza una empresa desconocida, sin Drive o sin ponente', async () => {
    await expectError({ ...request, org: 'otra' }, 'not-found');
    await expectError({ ...request, speaker: '  ' }, 'invalid-argument');
    db.docs.set('orgs/org1', { ...db.docs.get('orgs/org1'), drive: { connected: false } });
    await expectError(request, 'failed-precondition');
  });

  it('si falla Drive después de reservar, se devuelven el uso del código y el cupo', async () => {
    google.startResumableSession.mockRejectedValueOnce(new Error('drive caído'));
    await expect(sessions.createSession(null, request)).rejects.toThrow('drive caído');
    expect(db.docs.get(`orgs/org1/codes/${hash}`).uploads).toBe(0);
    expect(db.docs.get('usage/org1_20261010')).toEqual({ sessions: 0 });
  });

  it('al llegar al tope diario rechaza sin contar el código', async () => {
    db.docs.set('usage/org1_20261010', { sessions: 2 });
    await expectError(request, 'resource-exhausted');
  });
});
