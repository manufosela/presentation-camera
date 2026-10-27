import { beforeEach, describe, expect, it } from 'vitest';
import { MESSAGES } from './messages.js';
import { fakePublishSdk } from './test-support/fakePublishSdk.js';
import { createPublisher, loadPublishSdk } from './publishStore.js';

let fake;
let publisher;

beforeEach(() => {
  fake = fakePublishSdk();
  publisher = createPublisher(fake.api, { origin: 'https://onsli.de' });
});

const codeOf = promise => promise.then(() => null, error => error.code);
const signedUp = async () => {
  await publisher.signIn();
  await publisher.reserveUsername('ana');
};

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

describe('publicar y despublicar (CAM-TSK-0179)', () => {
  it('sube el deck como texto plano, lo apunta en la lista y da su URL', async () => {
    await signedUp();
    expect(await publisher.publish({ deck: 'mi-charla', html: '<h1>Hola</h1>' })).toBe('https://onsli.de/ana/mi-charla');
    expect(fake.files.get('decks/uid-ana/mi-charla.html')).toEqual({ body: '<h1>Hola</h1>', format: 'raw', metadata: { contentType: 'text/plain' } });
    expect((await publisher.profile()).decks).toEqual(['mi-charla']);
  });

  it('volver a publicar el mismo nombre lo reemplaza sin repetirlo en la lista', async () => {
    await signedUp();
    await publisher.publish({ deck: 'mi-charla', html: 'v1' });
    await publisher.publish({ deck: 'mi-charla', html: 'v2' });
    expect(fake.files.get('decks/uid-ana/mi-charla.html').body).toBe('v2');
    expect((await publisher.profile()).decks).toEqual(['mi-charla']);
  });

  it('pide nombre de usuario antes y rechaza nombres no válidos, decks enormes y el número 21', async () => {
    await publisher.signIn();
    expect(await codeOf(publisher.publish({ deck: 'mi-charla', html: 'x' }))).toBe('publish.noUsername');
    await publisher.reserveUsername('ana');
    expect(await codeOf(publisher.publish({ deck: 'Mi charla', html: 'x' }))).toBe('publish.invalidName');
    expect(await codeOf(publisher.publish({ deck: 'grande', html: 'x'.repeat(10 * 1024 * 1024 + 1) }))).toBe('publish.tooBig');
    fake.docs.get('users/uid-ana').decks = Array.from({ length: 20 }, (_, i) => `deck-${i}`);
    expect(await codeOf(publisher.publish({ deck: 'otra', html: 'x' }))).toBe('publish.tooMany');
    expect(await codeOf(publisher.publish({ deck: 'deck-3', html: 'x' }))).toBeNull();
  });

  it('si la subida falla, la lista vuelve a como estaba', async () => {
    await signedUp();
    fake.failNextUpload.value = true;
    expect(await codeOf(publisher.publish({ deck: 'mi-charla', html: 'x' }))).toBe('publish.failed');
    expect((await publisher.profile()).decks).toEqual([]);
  });

  it('despublicar borra el fichero y lo saca de la lista, aunque el fichero ya no exista', async () => {
    await signedUp();
    await publisher.publish({ deck: 'mi-charla', html: 'x' });
    await publisher.unpublish('mi-charla');
    expect(fake.files.size).toBe(0);
    expect((await publisher.profile()).decks).toEqual([]);
    await publisher.publish({ deck: 'otra', html: 'x' });
    fake.files.clear();
    await publisher.unpublish('otra');
    expect((await publisher.profile()).decks).toEqual([]);
  });

  it('cada error nuevo es un mensaje del catálogo', () => {
    for (const key of ['publish.noUsername', 'publish.tooBig', 'publish.tooMany']) {
      expect(MESSAGES[key]).toEqual({ es: expect.any(String), en: expect.any(String) });
    }
  });
});

describe('carga del SDK', () => {
  it('importa Auth, Firestore y Storage fijados de gstatic sobre la app de onslide', async () => {
    const urls = [];
    const importer = async url => {
      urls.push(url);
      return { initializeApp: config => ({ config }), getAuth: app => ({ app }), getFirestore: app => ({ app }), getStorage: app => ({ app }) };
    };
    const sdk = await loadPublishSdk(importer);
    expect(urls.map(url => url.split('/').at(-1))).toEqual(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js', 'firebase-storage.js']);
    expect(urls.every(url => url.startsWith('https://www.gstatic.com/firebasejs/13.0.0/'))).toBe(true);
    expect(sdk.auth.app.config).toMatchObject({ projectId: 'precam-app', authDomain: 'precam-app.firebaseapp.com' });
    expect(sdk.db.app).toBe(sdk.auth.app);
    expect(sdk.storage.app).toBe(sdk.auth.app);
  });
});
