import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fakeFirestore } from '../../test-support/fakeFirestore.js';
import { DRIVE, buildDriveConnect, buildUploadSessions } from './driveSetup.js';
import { generateEventCode } from './eventCodes.js';

const deps = { db: {}, fetch: async () => {}, randomBytes, now: Date.now, timestamp: ms => ms };

describe('buildDriveConnect — configuración de producción (CAM-TSK-0146)', () => {
  it('usa el cliente onslide-web y la URI de redirección de la Function', async () => {
    const db = { doc: () => ({ get: async () => ({ exists: true, data: () => ({ drive: { connected: false } }) }), create: async () => {} }) };
    const connect = buildDriveConnect({ ...deps, db, clientSecret: 's', tokenKey: randomBytes(32).toString('base64') });
    const { url } = await connect.start({ uid: 'u', token: { orgId: 'org1' } }, { orgId: 'org1' });
    const params = new URL(url).searchParams;
    expect(params.get('client_id')).toBe(DRIVE.clientId);
    expect(params.get('redirect_uri')).toBe('https://europe-west1-precam-app.cloudfunctions.net/driveConnectCallback');
  });

  it('el client id es el público del proyecto y el panel está en onsli.de', () => {
    expect(DRIVE.clientId).toMatch(/^914471047423-[a-z0-9]+\.apps\.googleusercontent\.com$/);
    expect(new URL(DRIVE.panelUrl).origin).toBe('https://onsli.de');
  });

  it('exige el secreto del cliente y la clave de cifrado', () => {
    expect(() => buildDriveConnect({ ...deps, clientSecret: '', tokenKey: 'x' })).toThrow('GOOGLE_CLIENT_SECRET');
    expect(() => buildDriveConnect({ ...deps, clientSecret: 's', tokenKey: 'corta' })).toThrow('ORG_TOKEN_KEY');
    expect(() => buildUploadSessions({ ...deps, clientSecret: '', tokenKey: 'x' })).toThrow('GOOGLE_CLIENT_SECRET');
  });
});

describe('buildUploadSessions — sesiones de subida de producción (CAM-TSK-0154)', () => {
  it('rechaza una empresa desconocida antes de tocar Google', async () => {
    const fetch = async () => { throw new Error('no debería llamar a Google'); };
    const sessions = buildUploadSessions({ ...deps, db: fakeFirestore(), fetch, newId: () => 'u1', clientSecret: 's', tokenKey: randomBytes(32).toString('base64') });
    const { code } = generateEventCode(() => new Uint8Array(16).fill(1));
    await expect(sessions.createSession(null, { org: 'nadie', code, speaker: 'Ana', mimeType: 'video/webm' }))
      .rejects.toMatchObject({ code: 'not-found' });
  });
});
