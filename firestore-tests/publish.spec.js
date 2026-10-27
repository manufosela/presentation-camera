// Reglas de Firestore para publicar slides (CAM-TSK-0168, ADR 0002). Corre
// contra el emulador: npm run test:rules
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env;

const anon = () => env.unauthenticatedContext().firestore();
const as = uid => env.authenticatedContext(uid).firestore();
const superadmin = () => env.authenticatedContext('owner', { superadmin: true }).firestore();

/** Reserva `name` para `uid` como lo hace la app: los dos documentos en un batch. */
function reserve(db, uid, name) {
  const batch = writeBatch(db);
  batch.set(doc(db, `usernames/${name}`), { uid });
  batch.set(doc(db, `users/${uid}`), { username: name, decks: [] });
  return batch.commit();
}

const report = (fields = {}) => ({ username: 'ana', deck: 'mi-charla', reason: 'Suplanta a un banco', createdAt: serverTimestamp(), ...fields });

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
    await setDoc(doc(db, 'usernames/ana'), { uid: 'uid-ana' });
    await setDoc(doc(db, 'users/uid-ana'), { username: 'ana', decks: ['mi-charla'] });
  });
});

describe('nombres de usuario', () => {
  it('cualquiera lee a quién pertenece un nombre, para resolver la URL pública', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'usernames/ana')));
  });

  it('un ponente con sesión reserva un nombre libre junto con su perfil', async () => {
    await assertSucceeds(reserve(as('uid-bea'), 'uid-bea', 'bea'));
  });

  it('sin sesión, a nombre de otro, ocupado o sin perfil no se reserva', async () => {
    await assertFails(reserve(anon(), 'uid-bea', 'bea'));
    await assertFails(reserve(as('uid-bea'), 'uid-otro', 'bea'));
    await assertFails(reserve(as('uid-bea'), 'uid-bea', 'ana'));
    await assertFails(setDoc(doc(as('uid-bea'), 'usernames/bea'), { uid: 'uid-bea' }));
  });

  it('rechaza nombres no válidos y los que taparían rutas del sitio', async () => {
    for (const name of ['Bea', 'b', 'bea_', '-bea', 'bea-', 'vendor', 'poc', 'remote', 'a'.repeat(31)]) {
      await assertFails(reserve(as('uid-bea'), 'uid-bea', name));
    }
  });

  it('un ponente no reserva un segundo nombre ni cambia o suelta el suyo', async () => {
    await assertFails(reserve(as('uid-ana'), 'uid-ana', 'ana2'));
    await assertFails(updateDoc(doc(as('uid-ana'), 'users/uid-ana'), { username: 'otra' }));
    await assertFails(deleteDoc(doc(as('uid-ana'), 'usernames/ana')));
    await assertFails(updateDoc(doc(as('uid-ana'), 'usernames/ana'), { uid: 'uid-bea' }));
  });
});

describe('lista de decks', () => {
  it('el dueño lee y cambia su lista; nadie más la lee ni la toca', async () => {
    await assertSucceeds(getDoc(doc(as('uid-ana'), 'users/uid-ana')));
    await assertSucceeds(updateDoc(doc(as('uid-ana'), 'users/uid-ana'), { decks: ['mi-charla', 'otra'] }));
    await assertFails(getDoc(doc(as('uid-bea'), 'users/uid-ana')));
    await assertFails(updateDoc(doc(as('uid-bea'), 'users/uid-ana'), { decks: [] }));
  });

  it('no pasa de 20 decks ni admite campos de más', async () => {
    const decks = Array.from({ length: 21 }, (_, i) => `deck-${i}`);
    await assertFails(updateDoc(doc(as('uid-ana'), 'users/uid-ana'), { decks }));
    await assertSucceeds(updateDoc(doc(as('uid-ana'), 'users/uid-ana'), { decks: decks.slice(0, 20) }));
    await assertFails(updateDoc(doc(as('uid-ana'), 'users/uid-ana'), { admin: true }));
  });
});

describe('denuncias', () => {
  it('cualquiera denuncia un deck, sin sesión', async () => {
    await assertSucceeds(addDoc(collection(anon(), 'reports'), report()));
  });

  it('rechaza denuncias vacías, enormes, con campos de más o con fecha inventada', async () => {
    await assertFails(addDoc(collection(anon(), 'reports'), report({ reason: '' })));
    await assertFails(addDoc(collection(anon(), 'reports'), report({ reason: 'x'.repeat(501) })));
    await assertFails(addDoc(collection(anon(), 'reports'), report({ ip: '1.2.3.4' })));
    await assertFails(addDoc(collection(anon(), 'reports'), report({ createdAt: new Date(0) })));
  });

  it('solo el dueño de onslide las lee', async () => {
    await assertFails(getDoc(doc(anon(), 'reports/r1')));
    await assertFails(getDoc(doc(as('uid-ana'), 'reports/r1')));
    await assertSucceeds(getDoc(doc(superadmin(), 'reports/r1')));
  });
});
