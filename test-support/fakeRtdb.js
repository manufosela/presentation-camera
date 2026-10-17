/**
 * Realtime Database en memoria para los tests del mando (CAM-TSK-0167). Imita
 * la API modular que se usa: ref, set, remove, onValue (avisa al suscribirse
 * y en cada cambio del propio camino o de debajo) y onDisconnect. Cada
 * client() es un dispositivo con su conexión: sus onDisconnect se aplican al
 * llamar a su disconnect().
 */

export function fakeRtdb() {
  const values = new Map();
  const listeners = new Set();

  const valueAt = path => {
    if (values.has(path)) return structuredClone(values.get(path));
    const children = [...values].filter(([key]) => key.startsWith(`${path}/`));
    if (children.length === 0) return null;
    const tree = {};
    for (const [key, value] of children) {
      const parts = key.slice(path.length + 1).split('/');
      const leaf = parts.pop();
      const parent = parts.reduce((node, part) => (node[part] ??= {}), tree);
      parent[leaf] = structuredClone(value);
    }
    return tree;
  };
  const clear = path => {
    for (const key of values.keys()) if (key === path || key.startsWith(`${path}/`)) values.delete(key);
    // Escribir debajo de un valor simple lo sustituye por un objeto, como en RTDB.
    const parts = path.split('/');
    for (let depth = 1; depth < parts.length; depth++) values.delete(parts.slice(0, depth).join('/'));
  };
  const write = (path, value) => {
    clear(path);
    const flatten = (base, node) => {
      if (node === null || typeof node !== 'object') values.set(base, node);
      else for (const [key, child] of Object.entries(node)) flatten(`${base}/${key}`, child);
    };
    if (value !== null) flatten(path, value);
    for (const listener of listeners) {
      if (listener.path.startsWith(path) || path.startsWith(listener.path)) listener.callback({ val: () => valueAt(listener.path) });
    }
  };

  function client() {
    const pendingOnDisconnect = new Map();
    const api = {
      db: {},
      ref: (_db, path) => {
        if (!path) throw new Error('fakeRtdb no admite la raíz: usa un camino concreto');
        return { path };
      },
      set: async (ref, value) => write(ref.path, value),
      remove: async ref => write(ref.path, null),
      onValue: (ref, callback) => {
        const listener = { path: ref.path, callback };
        listeners.add(listener);
        callback({ val: () => valueAt(ref.path) });
        return () => listeners.delete(listener);
      },
      onDisconnect: ref => ({
        set: async value => { pendingOnDisconnect.set(ref.path, value); },
        remove: async () => { pendingOnDisconnect.set(ref.path, null); },
        cancel: async () => { pendingOnDisconnect.delete(ref.path); },
      }),
    };
    const disconnect = () => {
      for (const [path, value] of pendingOnDisconnect) write(path, value);
      pendingOnDisconnect.clear();
    };
    return { api, disconnect };
  }

  return { client, read: valueAt };
}
