/**
 * Publicar decks en onsli.de/<usuario>/<deck> (ADR 0002): login y nombre de
 * usuario (CAM-TSK-0178).
 *
 * Login con Google solo para publicar. El nombre de usuario se reserva junto
 * con el perfil users/{uid} en un batch; las reglas impiden cambiarlo. El SDK
 * se carga bajo demanda desde gstatic, con la versión fijada, como el del mando.
 */

import { FIREBASE_WEB_CONFIG } from './firebaseWebConfig.js';
import { usernameError } from './publishNames.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.0.0';

export class PublishError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'PublishError';
    this.code = code;
  }
}

export async function loadPublishSdk(importer = url => import(url)) {
  const [{ initializeApp }, auth, firestore] = await Promise.all(
    ['app', 'auth', 'firestore'].map(name => importer(`${SDK}/firebase-${name}.js`)),
  );
  const app = initializeApp(FIREBASE_WEB_CONFIG, 'onslide-publish');
  return { ...auth, ...firestore, auth: auth.getAuth(app), db: firestore.getFirestore(app) };
}

const rejectIf = code => {
  if (code) throw new PublishError(code);
};

export function createPublisher(sdk) {
  const uid = () => sdk.auth.currentUser?.uid ?? rejectIf('publish.signedOut');
  const profileDoc = () => sdk.doc(sdk.db, 'users', uid());

  return {
    async signIn() {
      return (await sdk.signInWithPopup(sdk.auth, new sdk.GoogleAuthProvider())).user;
    },

    signOut: () => sdk.signOut(sdk.auth),

    /** Perfil del ponente ({ username, decks }), o null si aún no ha reservado nombre. */
    async profile() {
      const snapshot = await sdk.getDoc(profileDoc());
      return snapshot.exists() ? snapshot.data() : null;
    },

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
  };
}
