import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore } from '../../test-support/fakeFirestore.js';
import { createDriveConnect } from './driveConnect.js';
import { GoogleApiError } from './googleClient.js';

const NOW = Date.UTC(2026, 9, 10);
const at = ms => ({ toMillis: () => ms });
const admin = { uid: 'admin-org1', token: { orgId: 'org1' } };
const PANEL = 'https://onsli.de/panel.html';

let db;
let google;
let connect;
beforeEach(() => {
  db = fakeFirestore();
  db.docs.set('orgs/org1', { name: 'Acme', drive: { connected: false } });
  google = {
    authUrl: state => `https://accounts.test/auth?state=${state}`,
    exchangeCode: vi.fn(async () => ({ accessToken: 'at', refreshToken: 'rt', email: 'it@acme.test' })),
    createFolder: vi.fn(async () => 'folder1'),
    revoke: vi.fn(async () => {}),
  };
  connect = createDriveConnect({
    db, google, panelUrl: PANEL,
    seal: (token, orgId) => ({ ciphertext: `sealed:${orgId}:${token}` }),
    unseal: (sealed, orgId) => sealed.ciphertext.replace(`sealed:${orgId}:`, ''),
    randomBytes: () => Buffer.alloc(32, 1),
    now: () => NOW, timestamp: at,
  });
});

const stateOf = url => new URL(url).searchParams.get('state');

describe('conectar el Drive de la empresa (CAM-TSK-0145)', () => {
  it('start da la URL de Google con un state ligado a la empresa que caduca en 10 minutos', async () => {
    const { url } = await connect.start(admin, { orgId: 'org1' });
    expect(db.docs.get(`oauthStates/${stateOf(url)}`)).toMatchObject({ orgId: 'org1', uid: 'admin-org1' });
    expect(db.docs.get(`oauthStates/${stateOf(url)}`).expiresAt.toMillis()).toBe(NOW + 10 * 60_000);
    await expect(connect.start({ uid: 'x', token: { orgId: 'org2' } }, { orgId: 'org1' })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('callback guarda el token cifrado, consume el state y no toca el Drive todavía', async () => {
    const state = stateOf((await connect.start(admin, { orgId: 'org1' })).url);
    expect(await connect.callback({ state, code: 'c0de' })).toBe(`${PANEL}?drive=connected`);
    expect(db.docs.get('orgs/org1/private/drive')).toMatchObject({ ciphertext: 'sealed:org1:rt', connectedBy: 'admin-org1' });
    expect(db.docs.get('orgs/org1').drive).toMatchObject({ connected: true, email: 'it@acme.test' });
    expect(google.createFolder).not.toHaveBeenCalled();
    expect(db.docs.has(`oauthStates/${state}`)).toBe(false);
    expect(await connect.callback({ state, code: 'c0de' })).toBe(`${PANEL}?drive=error&reason=state`);
  });

  it('un state caducado, un rechazo del usuario o un fallo de Google no guardan nada', async () => {
    const state = stateOf((await connect.start(admin, { orgId: 'org1' })).url);
    db.docs.get(`oauthStates/${state}`).expiresAt = at(NOW - 1);
    expect(await connect.callback({ state, code: 'c' })).toBe(`${PANEL}?drive=error&reason=state`);
    expect(await connect.callback({ error: 'access_denied' })).toBe(`${PANEL}?drive=error&reason=denied`);
    const fresh = stateOf((await connect.start(admin, { orgId: 'org1' })).url);
    google.exchangeCode.mockRejectedValueOnce(new Error('google caído'));
    expect(await connect.callback({ state: fresh, code: 'c' })).toBe(`${PANEL}?drive=error&reason=google`);
    expect(db.docs.has('orgs/org1/private/drive')).toBe(false);
    const again = stateOf((await connect.start(admin, { orgId: 'org1' })).url);
    const realTransaction = db.runTransaction;
    let transactions = 0; // la 1.ª consume el state; la 2.ª (guardar) falla al confirmar
    db.runTransaction = fn => (++transactions === 2 ? Promise.reject(new Error('commit')) : realTransaction(fn));
    expect(await connect.callback({ state: again, code: 'c' })).toBe(`${PANEL}?drive=error&reason=google`);
    expect(google.revoke).toHaveBeenCalledWith('rt'); // el token canjeado no se queda vivo
    expect(db.docs.has('orgs/org1/private/drive')).toBe(false);
    expect(db.docs.get('orgs/org1').drive.connected).toBe(false);
  });

  it('una empresa ya conectada no se reconecta: ni start ni una vuelta pendiente', async () => {
    const pending = stateOf((await connect.start(admin, { orgId: 'org1' })).url);
    db.docs.set('orgs/org1', { name: 'Acme', drive: { connected: true } });
    await expect(connect.start(admin, { orgId: 'org1' })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(await connect.callback({ state: pending, code: 'c' })).toBe(`${PANEL}?drive=error&reason=already`);
    expect(google.revoke).toHaveBeenCalledWith('rt'); // el token nuevo no se queda vivo
    expect(db.docs.has('orgs/org1/private/drive')).toBe(false);
  });
});

describe('desconectar el Drive de la empresa (CAM-TSK-0148)', () => {
  const connected = async () => {
    const state = stateOf((await connect.start(admin, { orgId: 'org1' })).url);
    await connect.callback({ state, code: 'c' });
  };

  it('revoca en Google y borra las credenciales', async () => {
    await connected();
    await connect.disconnect(admin, { orgId: 'org1' });
    expect(google.revoke).toHaveBeenCalledWith('rt');
    expect(db.docs.has('orgs/org1/private/drive')).toBe(false);
    expect(db.docs.get('orgs/org1').drive).toEqual({ connected: false });
  });

  it('si Google ya no reconoce el token (400) se borra igual', async () => {
    await connected();
    google.revoke.mockRejectedValueOnce(new GoogleApiError(400, 'invalid_token'));
    await connect.disconnect(admin, { orgId: 'org1' });
    expect(db.docs.has('orgs/org1/private/drive')).toBe(false);
  });

  it('ante un fallo pasajero se rechaza y la credencial se queda para reintentar', async () => {
    await connected();
    google.revoke.mockRejectedValueOnce(new Error('red caída'));
    await expect(connect.disconnect(admin, { orgId: 'org1' })).rejects.toMatchObject({ code: 'unavailable' });
    expect(db.docs.has('orgs/org1/private/drive')).toBe(true);
    await expect(connect.disconnect({ uid: 'x', token: { orgId: 'org2' } }, { orgId: 'org1' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
