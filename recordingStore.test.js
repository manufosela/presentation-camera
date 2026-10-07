import { beforeEach, describe, expect, it } from 'vitest';
import { createRecordingStore } from './recordingStore.js';
import { memoryDir } from './test-support/memoryOpfs.js';

let root;
let store;
beforeEach(() => {
  root = memoryDir();
  store = createRecordingStore(async () => root);
});

const text = blob => blob.text();
const sessionNames = async () => {
  const dir = await root.getDirectoryHandle('recordings', { create: true });
  const names = [];
  for await (const [name] of dir.entries()) names.push(name);
  return names.toSorted();
};

describe('recordingStore — grabación en trozos confirmados (CAM-TSK-0095)', () => {
  it('cada trozo queda guardado al escribirlo y al terminar se unen en orden', async () => {
    const session = await store.startSession({ mimeType: 'video/webm', startedAt: 1000 });
    for (const piece of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']) await session.append(new Blob([piece]));
    const video = await session.finish();
    expect(await text(video)).toBe('abcdefghijk');
    expect(video.type).toBe('video/webm');
  });

  it('lo escrito sobrevive aunque la sesión no se termine (cierre del navegador)', async () => {
    const session = await store.startSession({ mimeType: 'video/webm', startedAt: 1000 });
    await session.append(new Blob(['parte guardada']));
    // Nadie llama a finish(): el navegador se cerró.
    const dir = await (await root.getDirectoryHandle('recordings')).getDirectoryHandle(session.id);
    const meta = JSON.parse(await (await (await dir.getFileHandle('meta.json')).getFile()).text());
    expect(meta).toEqual({ mimeType: 'video/webm', startedAt: 1000 });
    const parts = [];
    for await (const [name, handle] of dir.entries()) if (name.startsWith('part-')) parts.push(await handle.getFile());
    expect(await text(new Blob(parts))).toBe('parte guardada');
  });

  it('una nueva sesión borra las terminadas, no las que quedaron a medias', async () => {
    const done = await store.startSession({ mimeType: 'video/webm', startedAt: 1000 });
    await done.append(new Blob(['x']));
    await done.finish();
    const unfinished = await store.startSession({ mimeType: 'video/webm', startedAt: 2000 });
    await unfinished.append(new Blob(['y']));
    await store.startSession({ mimeType: 'video/webm', startedAt: 3000 });
    expect(await sessionNames()).toEqual(['rec-2000', 'rec-3000']);
  });

  it('también limpia los ficheros sueltos del formato anterior', async () => {
    const dir = await root.getDirectoryHandle('recordings', { create: true });
    const old = await (await dir.getFileHandle('rec-1.webm', { create: true })).createWritable();
    await old.write(new Blob(['viejo']));
    await old.close();
    await store.startSession({ mimeType: 'video/webm', startedAt: 5000 });
    expect(await sessionNames()).toEqual(['rec-5000']);
  });
});
