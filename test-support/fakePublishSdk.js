/**
 * SDK de Firebase falso para publishStore (Auth + Firestore), en memoria.
 * Imita lo que importa de las reglas: un nombre de usuario ya reservado no se
 * puede volver a crear (permission-denied).
 */

const firebaseError = code => Object.assign(new Error(code), { code });

export function fakePublishSdk({ user = { uid: 'uid-ana' } } = {}) {
  const docs = new Map();
  const auth = { currentUser: null };

  const api = {
    auth,
    db: {},
    GoogleAuthProvider: class {
      providerId = 'google.com';
    },
    async signInWithPopup() {
      auth.currentUser = user;
      return { user };
    },
    async signOut() {
      auth.currentUser = null;
    },
    doc: (_db, ...segments) => segments.join('/'),
    async getDoc(path) {
      return { exists: () => docs.has(path), data: () => structuredClone(docs.get(path)) };
    },
    writeBatch() {
      const writes = [];
      return {
        set: (path, data) => writes.push([path, data]),
        async commit() {
          if (writes.some(([path]) => path.startsWith('usernames/') && docs.has(path))) throw firebaseError('permission-denied');
          for (const [path, data] of writes) docs.set(path, structuredClone(data));
        },
      };
    },
  };

  return { api, docs };
}
