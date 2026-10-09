/**
 * Firestore en memoria para los tests de las Functions (CAM-TSK-0153). Se
 * comporta como el real en lo que importa: cada lectura es una foto, create
 * falla si existe, y en una transacción las lecturas van antes que las
 * escrituras, que se aplican al final y no se aplican si algo lanza.
 */

export function fakeFirestore(initial = {}) {
  const docs = new Map(Object.entries(initial));
  const snap = path => {
    const data = docs.get(path);
    return { exists: data !== undefined, data: () => data };
  };
  const create = (path, data) => {
    if (docs.has(path)) throw new Error(`already exists: ${path}`);
    docs.set(path, data);
  };
  const merge = (path, data) => docs.set(path, { ...docs.get(path), ...data });

  const doc = path => ({
    path,
    get: async () => snap(path),
    create: async data => create(path, data),
    set: async data => { docs.set(path, data); },
    update: async data => merge(path, data),
    delete: async () => { docs.delete(path); },
  });

  async function runTransaction(fn) {
    const writes = []; // [op, path, data], aplicadas al final
    const write = op => (ref, data) => writes.push([op, ref.path, data]);
    const result = await fn({
      get: async ref => {
        if (writes.length > 0) throw new Error('Firestore transactions require all reads before all writes.');
        return snap(ref.path);
      },
      create: write(create),
      set: write((path, data) => docs.set(path, data)),
      update: write(merge),
      delete: write(path => docs.delete(path)),
    });
    for (const [op, path, data] of writes) op(path, data);
    return result;
  }

  return { docs, doc, runTransaction };
}
