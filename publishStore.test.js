import { beforeEach, describe, expect, it } from 'vitest';
import { MESSAGES } from './messages.js';
import { fakePublishSdk } from './test-support/fakePublishSdk.js';
import { createPublisher, loadPublishSdk } from './publishStore.js';

let fake;
let publisher;

beforeEach(() => {
  fake = fakePublishSdk();
  publisher = createPublisher(fake.api);
});

const codeOf = promise => promise.then(() => null, error => error.code);

describe('login y nombre de usuario (CAM-TSK-0178)', () => {
  it('entra con Google y aún no tiene perfil', async () => {
    expect(await publisher.signIn()).toEqual({ uid: 'uid-ana' });
    expect(await publisher.profile()).toBeNull();
  });

  it('reserva el nombre y el perfil en el mismo batch', async () => {
    await publisher.signIn();
    await publisher.reserveUsername('ana');
    expect(await publisher.profile()).toEqual({ username: 'ana', decks: [] });
    expect(fake.docs.get('usernames/ana')).toEqual({ uid: 'uid-ana' });
  });

  it('rechaza nombres no válidos o reservados sin llamar a Firebase, y los ocupados', async () => {
    await publisher.signIn();
    expect(await codeOf(publisher.reserveUsername('Ana'))).toBe('publish.invalidName');
    expect(await codeOf(publisher.reserveUsername('vendor'))).toBe('publish.reservedName');
    fake.docs.set('usernames/bea', { uid: 'otro' });
    expect(await codeOf(publisher.reserveUsername('bea'))).toBe('publish.usernameTaken');
    expect(fake.docs.has('users/uid-ana')).toBe(false);
  });

  it('sin sesión, o tras cerrarla, no se reserva ni se lee el perfil', async () => {
    expect(await codeOf(publisher.reserveUsername('ana'))).toBe('publish.signedOut');
    await publisher.signIn();
    await publisher.signOut();
    expect(await codeOf(publisher.profile())).toBe('publish.signedOut');
  });

  it('un fallo que no es de permisos se avisa como fallo genérico, con su causa', async () => {
    await publisher.signIn();
    fake.api.writeBatch = () => ({ set() {}, commit: async () => { throw Object.assign(new Error('x'), { code: 'unavailable' }); } });
    const error = await publisher.reserveUsername('ana').catch(caught => caught);
    expect(error.code).toBe('publish.failed');
    expect(error.cause.code).toBe('unavailable');
  });

  it('cada error es un mensaje del catálogo, en español e inglés', () => {
    for (const key of ['publish.usernameTaken', 'publish.signedOut', 'publish.failed']) {
      expect(MESSAGES[key]).toEqual({ es: expect.any(String), en: expect.any(String) });
    }
  });
});

describe('carga del SDK', () => {
  it('importa Auth y Firestore fijados de gstatic sobre la app de onslide', async () => {
    const urls = [];
    const importer = async url => {
      urls.push(url);
      return { initializeApp: config => ({ config }), getAuth: app => ({ app }), getFirestore: app => ({ app }) };
    };
    const sdk = await loadPublishSdk(importer);
    expect(urls.map(url => url.split('/').at(-1))).toEqual(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']);
    expect(urls.every(url => url.startsWith('https://www.gstatic.com/firebasejs/13.0.0/'))).toBe(true);
    expect(sdk.auth.app.config).toMatchObject({ projectId: 'precam-app', authDomain: 'precam-app.firebaseapp.com' });
    expect(sdk.db.app).toBe(sdk.auth.app);
  });
});
