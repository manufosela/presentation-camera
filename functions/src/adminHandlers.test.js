import { beforeEach, describe, expect, it } from 'vitest';
import { AdminError, createAdminHandlers } from './adminHandlers.js';

const NOW = Date.UTC(2026, 9, 10);
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
