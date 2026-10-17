// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRtdb } from './test-support/fakeRtdb.js';
import { joinRemote } from './remoteChannel.js';
import { createRemoteHost } from './remoteHost.js';

const ID = 'abcdefghijklmnopqrstuv';
let server;
let view;
let host;
let onCommand;
let onPhoneLost;

const fakeQr = () => ({ qrcode: () => ({ addData: vi.fn(), make: vi.fn(), createDataURL: () => 'data:image/gif;base64,QR' }) });

beforeEach(() => {
  server = fakeRtdb();
  document.body.innerHTML = '<img id="qr" alt=""><a id="url"></a><p id="status"></p>';
  view = { qrImage: document.getElementById('qr'), urlLink: document.getElementById('url'), status: document.getElementById('status') };
  onCommand = vi.fn();
  onPhoneLost = vi.fn();
  host = createRemoteHost({
    ...view,
    pageUrl: 'https://onsli.de/',
    newSessionId: () => ID,
    loadQr: async () => fakeQr(),
    loadRtdb: async () => server.client().api,
    onCommand,
    onPhoneLost,
    t: key => key,
  });
});

const joinPhone = () => {
  const phone = server.client();
  return joinRemote({ rtdb: phone.api, sessionId: ID, onDesktop: vi.fn(), onAck: vi.fn() }).then(remote => ({ remote, phone }));
};

describe('mando del móvil en el escritorio (CAM-TSK-0167)', () => {
  it('al abrir crea la sesión y enseña el QR y el enlace del mando', async () => {
    await host.open();
    expect(server.read(`remote/${ID}/desktop/online`)).toBe(true);
    expect(view.qrImage.src).toBe('data:image/gif;base64,QR');
    expect(view.urlLink.href).toBe(`https://onsli.de/remote.html#${ID}`);
    expect(view.status.textContent).toBe('remoteHost.waiting');
  });

  it('abrir otra vez reutiliza la misma sesión', async () => {
    const loads = vi.fn(async () => server.client().api);
    host = createRemoteHost({ ...view, pageUrl: 'https://onsli.de/', newSessionId: () => ID, loadQr: async () => fakeQr(), loadRtdb: loads, onCommand, t: key => key });
    await host.open();
    await host.open();
    expect(loads).toHaveBeenCalledOnce();
  });

  it('los comandos del móvil llegan al deck', async () => {
    await host.open();
    const { remote } = await joinPhone();
    await remote.send('next');
    expect(onCommand).toHaveBeenCalledWith({ method: 'next', args: [] });
  });

  it('muestra el móvil conectado y avisa cuando se desconecta', async () => {
    await host.open();
    const { phone } = await joinPhone();
    expect(view.status.textContent).toBe('remoteHost.phoneOn');
    phone.disconnect();
    expect(view.status.textContent).toBe('remoteHost.phoneOff');
    expect(onPhoneLost).toHaveBeenCalledOnce();
  });

  it('si la base no responde a tiempo lo dice en vez de quedarse esperando', async () => {
    vi.useFakeTimers();
    host = createRemoteHost({ ...view, pageUrl: 'https://onsli.de/', newSessionId: () => ID, loadQr: async () => fakeQr(), loadRtdb: () => new Promise(() => {}), onCommand, t: key => key });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const opening = host.open();
    await vi.advanceTimersByTimeAsync(15_000);
    await opening;
    vi.useRealTimers();
    expect(view.status.textContent).toBe('remoteHost.failed');
  });

  it('una sesión que llega después del tiempo límite se cierra, no queda mandando', async () => {
    vi.useFakeTimers();
    const { promise: dbReady, resolve } = Promise.withResolvers();
    const ids = [ID, 'zbcdefghijklmnopqrstuv'];
    host = createRemoteHost({ ...view, pageUrl: 'https://onsli.de/', newSessionId: () => ids.shift(), loadQr: async () => fakeQr(), loadRtdb: () => dbReady, onCommand, t: key => key });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const opening = host.open();
    await vi.advanceTimersByTimeAsync(15_000);
    await opening;
    vi.useRealTimers();
    const api = server.client().api;
    const remove = vi.spyOn(api, 'remove');
    resolve(api);
    await host.open(); // se puede reintentar sin esperar a la sesión que llega tarde
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
    expect(server.read(`remote/${ID}`)).toBeNull();
    expect(server.read('remote/zbcdefghijklmnopqrstuv/desktop/online')).toBe(true);
  });

  it('si no se puede abrir la sesión lo dice', async () => {
    host = createRemoteHost({ ...view, pageUrl: 'https://onsli.de/', newSessionId: () => ID, loadQr: async () => fakeQr(), loadRtdb: async () => { throw new Error('sin red'); }, onCommand, t: key => key });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await host.open();
    expect(view.status.textContent).toBe('remoteHost.failed');
  });
});
