/**
 * SDK de Firebase falso para publishStore (Auth + Firestore + Storage), en memoria.
 * Imita lo que importa de las reglas: un nombre de usuario ya reservado no se
 * puede volver a crear (permission-denied).
 */

const firebaseError = code => Object.assign(new Error(code), { code });

export function fakePublishSdk({ user = { uid: 'uid-ana' } } = {}) {
  const docs = new Map();
  const files = new Map();
  const auth = { currentUser: null };
  const failNextUpload = { value: false };

  const applyField = (current, value) => {
    if (value?.arrayUnion) return [...new Set([...current, value.arrayUnion])];
    if (value?.arrayRemove) return current.filter(item => item !== value.arrayRemove);
    return value;
  };

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
    async updateDoc(path, fields) {
      const current = docs.get(path);
      for (const [key, value] of Object.entries(fields)) current[key] = applyField(current[key], value);
    },
    arrayUnion: value => ({ arrayUnion: value }),
    arrayRemove: value => ({ arrayRemove: value }),
    storage: {},
    ref: (_storage, path) => path,
    async uploadString(path, body, format, metadata) {
      if (failNextUpload.value) {
        failNextUpload.value = false;
        throw firebaseError('storage/unauthorized');
      }
      files.set(path, { body, format, metadata });
    },
    async deleteObject(path) {
      if (!files.delete(path)) throw firebaseError('storage/object-not-found');
    },
  };

  return { api, docs, files, failNextUpload };
}
