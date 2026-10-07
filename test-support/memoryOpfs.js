/**
 * OPFS en memoria para tests. Como el real, lo escrito con createWritable no
 * existe hasta close(): así los tests prueban que lo guardado está confirmado.
 */
export function memoryDir() {
  const files = new Map();
  const dirs = new Map();
  const notFound = () => new DOMException('not found', 'NotFoundError');
  return {
    kind: 'directory',
    async getDirectoryHandle(name, opts) {
      if (!dirs.has(name)) {
        if (!opts?.create) throw notFound();
        dirs.set(name, memoryDir());
      }
      return dirs.get(name);
    },
    async getFileHandle(name, opts) {
      if (!files.has(name) && !opts?.create) throw notFound();
      return {
        kind: 'file',
        async getFile() {
          if (!files.has(name)) throw notFound();
          return files.get(name);
        },
        async createWritable() {
          const staged = [];
          return {
            write: async data => { staged.push(data); },
            close: async () => { files.set(name, new File(staged, name)); },
          };
        },
      };
    },
    async *entries() {
      // Orden inverso: OPFS no garantiza ningún orden.
      for (const name of [...dirs.keys()].toReversed()) yield [name, dirs.get(name)];
      for (const name of [...files.keys()].toReversed()) yield [name, await this.getFileHandle(name)];
    },
    async removeEntry(name, opts) {
      if (dirs.has(name)) {
        if (!opts?.recursive) throw new DOMException('not empty', 'InvalidModificationError');
        dirs.delete(name);
      } else if (!files.delete(name)) throw notFound();
    },
  };
}
