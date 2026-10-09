// Reglas de Firestore (CAM-TSK-0103). Corre contra el emulador: npm run test:rules
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env;
const day = 24 * 3600 * 1000;
const event = { name: 'Congreso', startsAt: Timestamp.fromMillis(Date.now()), endsAt: Timestamp.fromMillis(Date.now() + day) };
const code = { eventId: 'ev1', label: 'Sala A', expiresAt: Timestamp.fromMillis(Date.now() + day), revoked: false, maxUploads: 20, uploads: 0 };

const anon = () => env.unauthenticatedContext().firestore();
const adminOf = orgId => env.authenticatedContext(`admin-${orgId}`, { orgId }).firestore();
const superadmin = () => env.authenticatedContext('owner', { superadmin: true }).firestore();
const stranger = () => env.authenticatedContext('nobody').firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-onslide',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const orgId of ['a', 'b']) {
      await setDoc(doc(db, `orgs/${orgId}`), { name: `Empresa ${orgId}`, status: 'active' });
      await setDoc(doc(db, `orgs/${orgId}/private/drive`), { refreshTokenEnc: 'x' });
      await setDoc(doc(db, `orgs/${orgId}/events/ev1`), event);
      await setDoc(doc(db, `orgs/${orgId}/codes/hash1`), code);
      await setDoc(doc(db, `orgs/${orgId}/uploads/up1`), { bytes: 1 });
    }
    await setDoc(doc(db, 'oauthStates/s1'), { orgId: 'a' });
  });
});

describe('empresas', () => {
  it('sin login o sin rol no se lee nada', async () => {
    await assertFails(getDoc(doc(anon(), 'orgs/a')));
    await assertFails(getDoc(doc(stranger(), 'orgs/a')));
  });

  it('un administrador lee su empresa y no la de otra', async () => {
    await assertSucceeds(getDoc(doc(adminOf('a'), 'orgs/a')));
    await assertFails(getDoc(doc(adminOf('a'), 'orgs/b')));
  });

  it('el superadmin lee cualquier empresa, pero nadie la escribe desde el navegador', async () => {
    await assertSucceeds(getDoc(doc(superadmin(), 'orgs/b')));
    await assertFails(updateDoc(doc(adminOf('a'), 'orgs/a'), { name: 'Otra' }));
    await assertFails(updateDoc(doc(superadmin(), 'orgs/a'), { name: 'Otra' }));
  });

  it('las credenciales y los estados de OAuth no los lee nadie', async () => {
    await assertFails(getDoc(doc(adminOf('a'), 'orgs/a/private/drive')));
    await assertFails(getDoc(doc(superadmin(), 'orgs/a/private/drive')));
    await assertFails(getDoc(doc(superadmin(), 'oauthStates/s1')));
  });
});

describe('eventos', () => {
  it('un administrador crea y borra eventos válidos de su empresa', async () => {
    await assertSucceeds(setDoc(doc(adminOf('a'), 'orgs/a/events/ev2'), event));
    await assertSucceeds(deleteDoc(doc(adminOf('a'), 'orgs/a/events/ev2')));
    await assertFails(setDoc(doc(adminOf('a'), 'orgs/b/events/ev2'), event));
  });

  it('rechaza eventos con campos de más, sin nombre o que acaban antes de empezar', async () => {
    const db = adminOf('a');
    await assertFails(setDoc(doc(db, 'orgs/a/events/x1'), { ...event, folderId: 'hack' }));
    await assertFails(setDoc(doc(db, 'orgs/a/events/x2'), { ...event, name: '' }));
    await assertFails(setDoc(doc(db, 'orgs/a/events/x3'), { ...event, endsAt: Timestamp.fromMillis(0) }));
  });
});

describe('códigos y subidas', () => {
  it('un administrador ve los códigos de su empresa pero no puede crearlos', async () => {
    await assertSucceeds(getDoc(doc(adminOf('a'), 'orgs/a/codes/hash1')));
    await assertFails(getDoc(doc(adminOf('a'), 'orgs/b/codes/hash1')));
    await assertFails(setDoc(doc(adminOf('a'), 'orgs/a/codes/hash2'), code));
  });

  it('solo puede revocar: ni reactivar ni cambiar otros campos', async () => {
    const db = adminOf('a');
    await assertFails(updateDoc(doc(db, 'orgs/a/codes/hash1'), { maxUploads: 999 }));
    await assertFails(updateDoc(doc(db, 'orgs/a/codes/hash1'), { revoked: true, uploads: 5 }));
    await assertSucceeds(updateDoc(doc(db, 'orgs/a/codes/hash1'), { revoked: true }));
    await assertFails(updateDoc(doc(db, 'orgs/a/codes/hash1'), { revoked: false }));
  });

  it('las subidas se leen pero no se escriben desde el navegador', async () => {
    await assertSucceeds(getDoc(doc(adminOf('a'), 'orgs/a/uploads/up1')));
    await assertFails(setDoc(doc(adminOf('a'), 'orgs/a/uploads/up2'), { bytes: 1 }));
  });
});
