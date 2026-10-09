import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureEventFolder } from './driveFolders.js';

function fakeDb() {
  const docs = new Map();
  const snap = path => {
    const data = docs.get(path);
    return { exists: data !== undefined, data: () => data };
  };
  const runTransaction = async fn => {
    const ops = [];
    const result = await fn({ get: async r => snap(r.path), set: (r, data) => ops.push(() => docs.set(r.path, data)) });
    for (const op of ops) op();
    return result;
  };
  return { docs, doc: path => ({ path }), runTransaction };
}

let db;
let google;
let ids;
beforeEach(() => {
  db = fakeDb();
  ids = 0;
  google = { createFolder: vi.fn(async () => `folder${++ids}`) };
});

const ensure = (eventId = 'ev1', eventName = 'Congreso') =>
  ensureEventFolder({ db, google, accessToken: 'at', orgId: 'org1', eventId, eventName });

describe('ensureEventFolder — onslide/evento (CAM-TSK-0151)', () => {
  it('la primera vez crea onslide y el evento dentro, y los recuerda', async () => {
    expect(await ensure()).toBe('folder2');
    expect(google.createFolder.mock.calls).toEqual([
      ['at', { name: 'onslide' }],
      ['at', { name: 'Congreso', parentId: 'folder1' }],
    ]);
    expect(db.docs.get('orgs/org1/private/folders')).toEqual({ root: 'folder1', events: { ev1: 'folder2' } });
  });

  it('después reutiliza las carpetas; un evento nuevo solo crea la suya', async () => {
    await ensure();
    expect(await ensure()).toBe('folder2');
    expect(await ensure('ev2', 'Taller')).toBe('folder3');
    expect(google.createFolder).toHaveBeenLastCalledWith('at', { name: 'Taller', parentId: 'folder1' });
    expect(google.createFolder).toHaveBeenCalledTimes(3);
    expect(db.docs.get('orgs/org1/private/folders').events).toEqual({ ev1: 'folder2', ev2: 'folder3' });
  });

  it('si otra subida guardó antes la carpeta del evento, se usa la guardada', async () => {
    google.createFolder.mockImplementation(async (_at, { name }) => {
      if (name === 'Congreso') db.docs.set('orgs/org1/private/folders', { root: 'folder1', events: { ev1: 'ganadora' } });
      return `folder${++ids}`;
    });
    expect(await ensure()).toBe('ganadora');
  });
});
