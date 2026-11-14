// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDisplayStage } from './displayStage.js';

const display = { id: 'd1', type: 'display', title: null };
const labels = { share: 'Compartir pantalla', video: 'Pantalla compartida' };

function fakeStream() {
  const track = Object.assign(new EventTarget(), { stop: vi.fn() });
  // happy-dom solo acepta un MediaStream en srcObject; las pistas son falsas.
  return Object.assign(new MediaStream(), { track, getTracks: () => [track], getVideoTracks: () => [track] });
}
function cancelled() {
  return Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
}

let host;
let onEnded;
let onError;
beforeEach(() => {
  host = document.createElement('div');
  host.hidden = true;
  onEnded = vi.fn();
  onError = vi.fn();
});

function stage(getDisplayMedia) {
  return createDisplayStage({ host, mediaDevices: { getDisplayMedia }, labels, onEnded, onError });
}
const button = () => host.querySelector('button');
const video = () => host.querySelector('video');
async function share() {
  button().click();
  await vi.waitFor(() => expect(video() || !button().disabled).toBeTruthy());
}

describe('createDisplayStage — la pantalla compartida en el escenario (CAM-TSK-0193, ADR 3)', () => {
  it('al activarse muestra el botón «Compartir pantalla» y no pide nada todavía', () => {
    const getDisplayMedia = vi.fn();
    stage(getDisplayMedia).show(display);
    expect(host.hidden).toBe(false);
    expect(button().textContent).toBe('Compartir pantalla');
    expect(getDisplayMedia).not.toHaveBeenCalled();
  });

  it('el clic en el botón abre el selector y pinta lo compartido en un vídeo mudo', async () => {
    const stream = fakeStream();
    const getDisplayMedia = vi.fn(async () => stream);
    stage(getDisplayMedia).show(display);
    await share();
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
    expect(video().srcObject).toBe(stream);
    expect(video().muted).toBe(true);
    expect(video().getAttribute('aria-label')).toBe('Pantalla compartida');
    expect(button()).toBeNull();
  });

  it('cancelar el selector deja el botón para volver a intentarlo, sin avisar de error', async () => {
    const getDisplayMedia = vi.fn(async () => { throw cancelled(); });
    stage(getDisplayMedia).show(display);
    await share();
    expect(button()).not.toBeNull();
    expect(video()).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('un fallo que no es cancelar se avisa y se queda el botón', async () => {
    const failure = Object.assign(new Error('boom'), { name: 'NotReadableError' });
    stage(vi.fn(async () => { throw failure; })).show(display);
    await share();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(button()).not.toBeNull();
  });

  it('al dejar de ser la activa se paran las pistas y se vacía el escenario', async () => {
    const stream = fakeStream();
    const s = stage(vi.fn(async () => stream));
    s.show(display);
    await share();
    s.hide();
    expect(stream.track.stop).toHaveBeenCalled();
    expect(host.hidden).toBe(true);
    expect(host.childElementCount).toBe(0);
    stream.track.dispatchEvent(new Event('ended'));
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('dejar de compartir desde el navegador avisa y vuelve al botón', async () => {
    const stream = fakeStream();
    stage(vi.fn(async () => stream)).show(display);
    await share();
    stream.track.dispatchEvent(new Event('ended'));
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(video()).toBeNull();
    expect(button()).not.toBeNull();
  });

  it('si deja de ser la activa mientras el selector está abierto, lo elegido se suelta', async () => {
    const stream = fakeStream();
    let pick;
    const s = stage(vi.fn(() => new Promise(resolve => { pick = resolve; })));
    s.show(display);
    button().click();
    s.hide();
    pick(stream);
    await vi.waitFor(() => expect(stream.track.stop).toHaveBeenCalled());
    expect(host.childElementCount).toBe(0);
  });

  it('volver a mostrar la misma fuente no corta lo que se está compartiendo', async () => {
    const stream = fakeStream();
    const s = stage(vi.fn(async () => stream));
    s.show(display);
    await share();
    s.show({ ...display });
    expect(stream.track.stop).not.toHaveBeenCalled();
    expect(video().srcObject).toBe(stream);
  });
});
