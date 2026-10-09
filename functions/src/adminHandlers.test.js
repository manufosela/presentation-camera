import { beforeEach, describe, expect, it } from 'vitest';
import { AdminError, createAdminHandlers } from './adminHandlers.js';
import { hashEventCode } from './eventCodes.js';

const NOW = Date.UTC(2026, 9, 10);
const DAY = 24 * 3600 * 1000;
const at = ms => ({ toMillis: () => ms });

// Firestore en memoria con lo que usan los handlers: doc().get/create y transacciones.
function fakeDb() {
  const docs = new Map();
  const snap = path => ({ exists: docs.has(path), data: () => docs.get(path) });
  const create = (path, data) => {
    if (docs.has(path)) throw new Error(`already exists: ${path}`);
    docs.set(path, data);
  };
  const db = {
    docs,
    doc: path => ({ path, get: async () => snap(path), create: async data => create(path, data) }),
    runTransaction: async fn => fn({ get: async ref => snap(ref.path), create: (ref, data) => create(ref.path, data) }),
  };
  return db;
}

const superadmin = { uid: 'owner', token: { superadmin: true } };
const adminOf = orgId => ({ uid: `admin-${orgId}`, token: { orgId } });

let db;
let users;
let handlers;
beforeEach(() => {
  db = fakeDb();
  users = new Map([['ana@empresa.test', { uid: 'u-ana', customClaims: { lang: 'es' } }]]);
  let ids = 0;
  handlers = createAdminHandlers({
    db,
    auth: {
      getUserByEmail: async email => {
        if (!users.has(email)) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
        return users.get(email);
      },
      setCustomUserClaims: async (uid, claims) => {
        for (const user of users.values()) if (user.uid === uid) user.customClaims = claims;
      },
    },
    randomBytes: () => new Uint8Array(16).fill(7),
    newId: () => `org${++ids}`,
    now: () => NOW,
    timestamp: ms => at(ms),
  });
});

const expectError = async (promise, code) => {
  await expect(promise).rejects.toBeInstanceOf(AdminError);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('createOrg — solo el superadmin (CAM-TSK-0141)', () => {
  it('crea la empresa y reserva su slug', async () => {
    expect(await handlers.createOrg(superadmin, { name: ' Acme ', slug: 'acme' })).toEqual({ orgId: 'org1' });
    expect(db.docs.get('orgs/org1')).toMatchObject({ name: 'Acme', slug: 'acme', status: 'active', drive: { connected: false } });
    expect(db.docs.get('orgSlugs/acme')).toEqual({ orgId: 'org1' });
  });

  it('rechaza sin rol, con slug inválido o repetido', async () => {
    await expectError(handlers.createOrg(adminOf('org1'), { name: 'Acme', slug: 'acme' }), 'permission-denied');
    await expectError(handlers.createOrg(null, { name: 'Acme', slug: 'acme' }), 'permission-denied');
    await expectError(handlers.createOrg(superadmin, { name: 'Acme', slug: 'Acme Corp' }), 'invalid-argument');
    await expectError(handlers.createOrg(superadmin, { name: '', slug: 'acme' }), 'invalid-argument');
    await handlers.createOrg(superadmin, { name: 'Acme', slug: 'acme' });
    await expectError(handlers.createOrg(superadmin, { name: 'Otra', slug: 'acme' }), 'already-exists');
  });
});

describe('setOrgAdmin — solo el superadmin', () => {
  it('da el claim orgId sin perder los que ya tenía', async () => {
    await handlers.createOrg(superadmin, { name: 'Acme', slug: 'acme' });
    expect(await handlers.setOrgAdmin(superadmin, { email: 'ana@empresa.test', orgId: 'org1' })).toEqual({ uid: 'u-ana' });
    expect(users.get('ana@empresa.test').customClaims).toEqual({ lang: 'es', orgId: 'org1' });
  });

  it('rechaza una empresa inexistente, un usuario que nunca entró o sin rol', async () => {
    await expectError(handlers.setOrgAdmin(superadmin, { email: 'ana@empresa.test', orgId: 'nope' }), 'not-found');
    await handlers.createOrg(superadmin, { name: 'Acme', slug: 'acme' });
    await expectError(handlers.setOrgAdmin(superadmin, { email: 'nadie@empresa.test', orgId: 'org1' }), 'not-found');
    await expectError(handlers.setOrgAdmin(adminOf('org1'), { email: 'ana@empresa.test', orgId: 'org1' }), 'permission-denied');
  });
});

describe('createEventCode — administradores de esa empresa (CAM-TSK-0143)', () => {
  beforeEach(() => {
    db.docs.set('orgs/org1/events/ev1', { name: 'Congreso', startsAt: at(NOW), endsAt: at(NOW + DAY) });
  });

  it('devuelve el código una vez y guarda solo su hash', async () => {
    const { code, expiresAtMs } = await handlers.createEventCode(adminOf('org1'), { orgId: 'org1', eventId: 'ev1', label: 'Sala A' });
    expect(expiresAtMs).toBe(NOW + 3 * DAY); // fin del evento + 2 días
    const stored = db.docs.get(`orgs/org1/codes/${hashEventCode(code)}`);
    expect(stored).toMatchObject({ eventId: 'ev1', label: 'Sala A', revoked: false, maxUploads: 50, uploads: 0, createdBy: 'admin-org1' });
    expect(JSON.stringify([...db.docs.values()])).not.toContain(code);
  });

  it('para un evento lejano, la caducidad por defecto se queda en el máximo de un año', async () => {
    db.docs.set('orgs/org1/events/far', { name: 'Lejano', startsAt: at(NOW), endsAt: at(NOW + 500 * DAY) });
    const { expiresAtMs } = await handlers.createEventCode(adminOf('org1'), { orgId: 'org1', eventId: 'far' });
    expect(expiresAtMs).toBe(NOW + 365 * DAY);
  });

  it('rechaza otra empresa, un evento inexistente o valores fuera de rango', async () => {
    await expectError(handlers.createEventCode(adminOf('org2'), { orgId: 'org1', eventId: 'ev1' }), 'permission-denied');
    await expectError(handlers.createEventCode({ uid: 'x', token: {} }, { eventId: 'ev1' }), 'invalid-argument');
    await expectError(handlers.createEventCode(null, { orgId: 'org1', eventId: 'ev1' }), 'permission-denied');
    await expectError(handlers.createEventCode(adminOf('org1'), { orgId: 'org1', eventId: '../ev1' }), 'invalid-argument');
    await expectError(handlers.createEventCode(adminOf('org1'), { orgId: 'org1', eventId: 'nope' }), 'not-found');
    await expectError(handlers.createEventCode(adminOf('org1'), { orgId: 'org1', eventId: 'ev1', maxUploads: 0 }), 'invalid-argument');
    await expectError(handlers.createEventCode(adminOf('org1'), { orgId: 'org1', eventId: 'ev1', expiresAtMs: NOW - 1 }), 'invalid-argument');
    await expectError(handlers.createEventCode(adminOf('org1'), { orgId: 'org1', eventId: 'ev1', expiresAtMs: NOW + 400 * DAY }), 'invalid-argument');
  });
});
