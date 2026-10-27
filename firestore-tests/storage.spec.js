// Reglas de Storage de los decks publicados (CAM-TSK-0173, ADR 0002). Corre
// contra el emulador: npm run test:rules
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, listAll, ref, uploadString } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env;

const anon = () => env.unauthenticatedContext().storage();
const as = uid => env.authenticatedContext(uid).storage();
const TEXT = { contentType: 'text/plain' };
const upload = (storage, path, body = '<h1>Hola</h1>', metadata = TEXT) => uploadString(ref(storage, path), body, 'raw', metadata);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-onslide',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
    storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/uid-ana'), { username: 'ana', decks: ['mi-charla', 'otra'] });
    await upload(context.storage(), 'decks/uid-ana/mi-charla.html');
  });
});

describe('decks publicados', () => {
  it('cualquiera descarga un deck, sin sesión, pero no lista los de nadie', async () => {
    await assertSucceeds(getBytes(ref(anon(), 'decks/uid-ana/mi-charla.html')));
    await assertFails(listAll(ref(anon(), 'decks/uid-ana')));
  });

  it('el dueño sube un deck que está en su lista, como texto plano', async () => {
    await assertSucceeds(upload(as('uid-ana'), 'decks/uid-ana/otra.html'));
  });

  it('rechaza subir sin sesión, en el espacio de otro o un deck que no está en la lista', async () => {
    await assertFails(upload(anon(), 'decks/uid-ana/otra.html'));
    await assertFails(upload(as('uid-bea'), 'decks/uid-ana/otra.html'));
    await assertFails(upload(as('uid-ana'), 'decks/uid-ana/nueva.html'));
    await assertFails(upload(as('uid-ana'), 'decks/uid-ana/Otra.html'));
  });

  it('rechaza HTML servible como página y decks de más de 10 MB', async () => {
    await assertFails(upload(as('uid-ana'), 'decks/uid-ana/otra.html', '<h1>Hola</h1>', { contentType: 'text/html' }));
    await assertFails(upload(as('uid-ana'), 'decks/uid-ana/otra.html', 'x'.repeat(10 * 1024 * 1024 + 1)));
  });

  it('solo el dueño borra sus decks', async () => {
    await assertFails(deleteObject(ref(as('uid-bea'), 'decks/uid-ana/mi-charla.html')));
    await assertSucceeds(deleteObject(ref(as('uid-ana'), 'decks/uid-ana/mi-charla.html')));
  });

  it('fuera de decks/ no se lee ni se escribe nada', async () => {
    await assertFails(upload(as('uid-ana'), 'otros/uid-ana/x.html'));
    await assertFails(getBytes(ref(anon(), 'otros/x.html')));
  });
});
