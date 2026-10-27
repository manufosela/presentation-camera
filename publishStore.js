/**
 * Publicar decks en onsli.de/<usuario>/<deck> (ADR 0002): login y nombre de
 * usuario (CAM-TSK-0178), publicar y despublicar (CAM-TSK-0179).
 *
 * Login con Google solo para publicar. El nombre de usuario se reserva junto
 * con el perfil users/{uid} en un batch; las reglas impiden cambiarlo. Cada
 * deck va a Storage en decks/{uid}/{deck}.html como texto plano, y su nombre a
 * la lista del perfil, que es la que Storage acepta. El SDK se carga bajo
 * demanda desde gstatic, con la versión fijada, como el del mando.
 */

import { FIREBASE_WEB_CONFIG } from './firebaseWebConfig.js';
import { deckNameError, publicDeckUrl, usernameError } from './publishNames.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.0.0';
const MAX_DECKS = 20;
const MAX_DECK_BYTES = 10 * 1024 * 1024;

export class PublishError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'PublishError';
    this.code = code;
  }
}

export async function loadPublishSdk(importer = url => import(url)) {
  const [{ initializeApp }, auth, firestore, storage] = await Promise.all(
    ['app', 'auth', 'firestore', 'storage'].map(name => importer(`${SDK}/firebase-${name}.js`)),
  );
  const app = initializeApp(FIREBASE_WEB_CONFIG, 'onslide-publish');
  return {
    ...auth, ...firestore, ...storage,
    auth: auth.getAuth(app), db: firestore.getFirestore(app), storage: storage.getStorage(app),
  };
}

const rejectIf = code => {
  if (code) throw new PublishError(code);
};

export function createPublisher(sdk, { origin = globalThis.location?.origin } = {}) {
  const uid = () => sdk.auth.currentUser?.uid ?? rejectIf('publish.signedOut');
  const profileDoc = () => sdk.doc(sdk.db, 'users', uid());
  const deckRef = deck => sdk.ref(sdk.storage, `decks/${uid()}/${deck}.html`);

  /** Perfil del ponente ({ username, decks }), o null si aún no ha reservado nombre. */
  async function profile() {
    const snapshot = await sdk.getDoc(profileDoc());
    return snapshot.exists() ? snapshot.data() : null;
  }

  return {
    profile,

    async signIn() {
      return (await sdk.signInWithPopup(sdk.auth, new sdk.GoogleAuthProvider())).user;
    },

    signOut: () => sdk.signOut(sdk.auth),

    async reserveUsername(username) {
      const owner = uid();
      rejectIf(usernameError(username));
      const batch = sdk.writeBatch(sdk.db);
      batch.set(sdk.doc(sdk.db, 'usernames', username), { uid: owner });
      batch.set(profileDoc(), { username, decks: [] });
      try {
        await batch.commit();
      } catch (error) {
        throw new PublishError(error.code === 'permission-denied' ? 'publish.usernameTaken' : 'publish.failed', { cause: error });
      }
    },

    /** Publica (o reemplaza) el deck y devuelve su URL pública. */
    async publish({ deck, html }) {
      uid();
      rejectIf(deckNameError(deck));
      if (new Blob([html]).size > MAX_DECK_BYTES) rejectIf('publish.tooBig');
      const current = await profile();
      if (!current) rejectIf('publish.noUsername');
      const isNew = !current.decks.includes(deck);
      if (isNew && current.decks.length >= MAX_DECKS) rejectIf('publish.tooMany');
      // Primero la lista: Storage solo acepta nombres que ya están en ella.
      if (isNew) await sdk.updateDoc(profileDoc(), { decks: sdk.arrayUnion(deck) });
      try {
        await sdk.uploadString(deckRef(deck), html, 'raw', { contentType: 'text/plain' });
      } catch (error) {
        if (isNew) await sdk.updateDoc(profileDoc(), { decks: sdk.arrayRemove(deck) });
        throw new PublishError('publish.failed', { cause: error });
      }
      return publicDeckUrl(origin, current.username, deck);
    },

    async unpublish(deck) {
      try {
        await sdk.deleteObject(deckRef(deck));
      } catch (error) {
        if (error.code !== 'storage/object-not-found') throw new PublishError('publish.failed', { cause: error });
      }
      await sdk.updateDoc(profileDoc(), { decks: sdk.arrayRemove(deck) });
    },
  };
}
