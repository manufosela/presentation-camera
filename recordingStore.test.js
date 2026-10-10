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

  it('descartar borra ya las terminadas y deja las que quedaron a medias (CAM-TSK-0139)', async () => {
    const done = await store.startSession({ mimeType: 'video/webm', startedAt: 1000 });
    await done.append(new Blob(['x']));
    await done.finish();
    const unfinished = await store.startSession({ mimeType: 'video/webm', startedAt: 2000 });
    await unfinished.append(new Blob(['y']));
    await done.finish(); // al parar, la sesión queda terminada
    await unfinished.append(new Blob(['z']));
    await store.discardFinished();
    expect(await sessionNames()).toEqual(['rec-2000']);
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

  it('lista las sesiones que quedaron a medias, con su vídeo, para recuperarlas (CAM-TSK-0122)', async () => {
    const done = await store.startSession({ mimeType: 'video/webm', startedAt: 1000 });
    await done.append(new Blob(['x']));
    await done.finish();
    const cut = await store.startSession({ mimeType: 'video/mp4', startedAt: 2000 });
    await cut.append(new Blob(['par']));
    await cut.append(new Blob(['cial']));
    const [pending, ...rest] = await store.pendingSessions();
    expect(rest).toEqual([]);
    expect(pending).toMatchObject({ id: 'rec-2000', mimeType: 'video/mp4', startedAt: 2000, size: 7 });
    expect(await text(await pending.video())).toBe('parcial');
  });

  it('una sesión recuperada se marca como terminada o se descarta', async () => {
    for (const startedAt of [1, 2]) {
      const session = await store.startSession({ mimeType: 'video/webm', startedAt });
      await session.append(new Blob(['z']));
    }
    const [b, a] = await store.pendingSessions(); // la más reciente primero
    expect([b.startedAt, a.startedAt]).toEqual([2, 1]);
    await a.markDone();
    await b.discard();
    expect(await store.pendingSessions()).toEqual([]);
    expect(await sessionNames()).toEqual(['rec-1']); // terminada: se borra al empezar otra
  });

  it('el WebM unido lleva su duración en la cabecera (CAM-TSK-0123)', async () => {
    const head = [0x1a, 0x45, 0xdf, 0xa3, 0x80, 0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      0x15, 0x49, 0xa9, 0x66, 0x87, 0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40];
    const session = await store.startSession({ mimeType: 'video/webm', startedAt: Date.now() - 2000 });
    await session.append(new Blob([new Uint8Array(head)]));
    await session.append(new Blob([new Uint8Array([0x1f, 0x43, 0xb6, 0x75])]));
    const video = new Uint8Array(await (await session.finish()).arrayBuffer());
    const at = video.findIndex((byte, i) => byte === 0x44 && video[i + 1] === 0x89);
    expect(at).toBeGreaterThan(0);
    expect(new DataView(video.buffer, at + 3, 8).getFloat64(0)).toBeGreaterThanOrEqual(2000);
    expect([...video.slice(-4)]).toEqual([0x1f, 0x43, 0xb6, 0x75]);
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
