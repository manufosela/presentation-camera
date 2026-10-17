import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRtdb } from './test-support/fakeRtdb.js';
import { hostRemote, joinRemote, loadRemoteDatabase } from './remoteChannel.js';

const ID = 'abcdefghijklmnopqrstuv';
let server;
let desktop;
let phone;

beforeEach(() => {
  server = fakeRtdb();
  desktop = server.client();
  phone = server.client();
});

const host = (extra = {}) => hostRemote({ rtdb: desktop.api, sessionId: ID, onCommand: vi.fn(), onPhone: vi.fn(), now: () => 1000, ...extra });
const join = (extra = {}) => joinRemote({ rtdb: phone.api, sessionId: ID, onDesktop: vi.fn(), onAck: vi.fn(), ...extra });

describe('mando móvil sobre Realtime Database (CAM-TSK-0167)', () => {
  it('el escritorio crea la sesión y la retira al cerrar', async () => {
    const session = await host();
    expect(server.read(`remote/${ID}`)).toMatchObject({ createdAt: 1000, desktop: { online: true } });
    await session.close();
    expect(server.read(`remote/${ID}`)).toBeNull();
  });

  it('un comando del móvil llega al escritorio como comando de deck y vuelve confirmado', async () => {
    const onCommand = vi.fn();
    await host({ onCommand });
    const onAck = vi.fn();
    const remote = await join({ onAck });
    await remote.send('next');
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({ method: 'next', args: [] });
    expect(onAck).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'next' }));
  });

  it('el móvil mide el tiempo de ida y vuelta de cada comando', async () => {
    await host();
    const ticks = [100, 160];
    const onAck = vi.fn();
    const remote = await join({ onAck, clock: () => ticks.shift() });
    await remote.send('prev');
    expect(onAck).toHaveBeenCalledWith({ name: 'prev', roundTripMs: 60 });
  });

  it('no repite un comando ya ejecutado ni ejecuta uno fuera de la lista', async () => {
    const onCommand = vi.fn();
    await host({ onCommand });
    await phone.api.set({ path: `remote/${ID}/cmd` }, { seq: 1, name: 'eval', sentAt: 1 });
    expect(onCommand).not.toHaveBeenCalled();
    await phone.api.set({ path: `remote/${ID}/cmd` }, { seq: 5, name: 'next', sentAt: 1 });
    await phone.api.set({ path: `remote/${ID}/cmd` }, { seq: 5, name: 'next', sentAt: 1 });
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it('el escritorio ve al móvil conectarse y desconectarse', async () => {
    const onPhone = vi.fn();
    await host({ onPhone });
    await join();
    expect(onPhone).toHaveBeenLastCalledWith(true);
    phone.disconnect();
    expect(onPhone).toHaveBeenLastCalledWith(false);
  });

  it('el móvil que cierra se marca desconectado y ya no deja escrituras pendientes', async () => {
    const onPhone = vi.fn();
    await host({ onPhone });
    const remote = await join();
    await remote.close();
    expect(onPhone).toHaveBeenLastCalledWith(false);
    await phone.api.set({ path: `remote/${ID}/phone/online` }, true);
    phone.disconnect();
    expect(server.read(`remote/${ID}/phone/online`)).toBe(true);
  });

  it('el móvil ve si el escritorio se cae', async () => {
    await host();
    const onDesktop = vi.fn();
    await join({ onDesktop });
    expect(onDesktop).toHaveBeenLastCalledWith(true);
    desktop.disconnect();
    expect(onDesktop).toHaveBeenLastCalledWith(false);
  });
});

describe('carga del SDK de Firebase', () => {
  it('carga app y database de la versión fijada y apunta a la base de europe-west1', async () => {
    const getDatabase = vi.fn(() => 'db');
    const initializeApp = vi.fn(() => 'app');
    const importer = vi.fn(async url => (url.endsWith('firebase-app.js') ? { initializeApp } : { getDatabase, ref: 'ref' }));
    const rtdb = await loadRemoteDatabase(importer);
    expect(importer.mock.calls.map(([url]) => url)).toEqual([
      'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js',
      'https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js',
    ]);
    expect(initializeApp.mock.calls[0][0].databaseURL).toBe('https://precam-app-default-rtdb.europe-west1.firebasedatabase.app');
    expect(rtdb).toMatchObject({ db: 'db', ref: 'ref' });
  });
});
