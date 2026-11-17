// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openCameraBubble } from './cameraBubble.js';
import { setLang } from './i18n.js';

// Ventana PiP falsa: un documento aparte, su propio rAF (se avanza a mano con
// nextFrame) y close() avisa con pagehide, como Chrome.
function fakePip() {
  const frames = new Map();
  let lastFrame = 0;
  const win = Object.assign(new EventTarget(), {
    document: document.implementation.createHTMLDocument(''),
    close: vi.fn(() => win.dispatchEvent(new Event('pagehide'))),
    requestAnimationFrame: vi.fn(callback => { frames.set(++lastFrame, callback); return lastFrame; }),
    cancelAnimationFrame: vi.fn(id => frames.delete(id)),
    nextFrame: () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback());
    },
  });
  return { win, pip: { requestWindow: vi.fn(async () => win) } };
}

const fakeCamera = () => {
  const track = { stop: vi.fn() };
  const stream = Object.assign(new MediaStream(), { getTracks: () => [track] }); // happy-dom no trae pistas
  return { track, stream };
};

function setup() {
  const { win, pip } = fakePip();
  const { track, stream } = fakeCamera();
  const actions = { onRecord: vi.fn(), onPause: vi.fn(), onStop: vi.fn(), onClose: vi.fn() };
  return { win, pip, track, stream, actions };
}

const CSS = 'data:text/css,'; // en línea: el entorno de test no descarga nada
const button = (win, name) => win.document.querySelector(`[data-action="${name}"]`);
const settle = () => new Promise(resolve => setTimeout(resolve, 0)); // el recorte se prepara en segundo plano

beforeEach(() => setLang('es', null));

describe('openCameraBubble — burbuja de cámara flotante (CAM-TSK-0164)', () => {
  it('abre la ventana flotante con la cámara, sus estilos y solo el botón de grabar', async () => {
    const { win, pip, stream, actions } = setup();
    await openCameraBubble({ pip, camera: stream, styleHref: CSS, ...actions });
    expect(pip.requestWindow).toHaveBeenCalledOnce();
    expect(win.document.querySelector('video').srcObject).toBe(stream);
    expect(win.document.querySelector('link[rel="stylesheet"]').getAttribute('href')).toBe(CSS);
    expect([button(win, 'record').hidden, button(win, 'pause').hidden, button(win, 'stop').hidden]).toEqual([false, true, true]);
  });

  it('cada botón llama a su acción y los botones siguen el estado', async () => {
    const { win, pip, stream, actions } = setup();
    const bubble = await openCameraBubble({ pip, camera: stream, styleHref: CSS, ...actions });
    button(win, 'record').click();
    expect(actions.onRecord).toHaveBeenCalledOnce();
    bubble.setState('recording');
    expect([button(win, 'record').hidden, button(win, 'pause').textContent, button(win, 'stop').hidden]).toEqual([true, 'Pausa', false]);
    button(win, 'pause').click();
    expect(actions.onPause).toHaveBeenCalledOnce();
    bubble.setState('paused');
    expect(button(win, 'pause').textContent).toBe('Seguir');
    button(win, 'stop').click();
    expect(actions.onStop).toHaveBeenCalledOnce();
  });

  it('al cerrarse, por la app o por el usuario, suelta la cámara y avisa una vez', async () => {
    const { win, pip, track, stream, actions } = setup();
    const bubble = await openCameraBubble({ pip, camera: stream, styleHref: CSS, ...actions });
    bubble.close();
    win.dispatchEvent(new Event('pagehide'));
    expect(track.stop).toHaveBeenCalled();
    expect(actions.onClose).toHaveBeenCalledOnce();
  });

  it('la cámara puede llegar después de abrir (el permiso de cámara tarda más que el del clic, CAM-TSK-0165)', async () => {
    const { win, pip, track, stream, actions } = setup();
    const bubble = await openCameraBubble({ pip, styleHref: CSS, ...actions });
    expect(win.document.querySelector('video').srcObject).toBeNull();
    bubble.showCamera(stream);
    expect(win.document.querySelector('video').srcObject).toBe(stream);
    bubble.close();
    expect(track.stop).toHaveBeenCalled();
  });

  it('el tamaño de la cámara (S/M/L) decide el de la ventana flotante (CAM-BUG-0031)', async () => {
    const opened = [];
    for (const size of ['s', 'm', 'l']) {
      const { pip, actions } = setup();
      await openCameraBubble({ pip, size, styleHref: CSS, ...actions });
      opened.push(pip.requestWindow.mock.calls[0][0]);
    }
    expect(opened).toEqual([{ width: 180, height: 240 }, { width: 240, height: 300 }, { width: 320, height: 380 }]);
  });

  it('«Sin cámara»: solo los botones (CAM-BUG-0031)', async () => {
    const { win, pip, actions } = setup();
    await openCameraBubble({ pip, withCamera: false, styleHref: CSS, ...actions });
    expect(win.document.querySelector('video, canvas')).toBeNull();
    expect(button(win, 'record').hidden).toBe(false);
  });

  it('silueta: dibuja el recorte en un canvas con el rAF de la burbuja, no con el de onslide (CAM-BUG-0031)', async () => {
    const { win, pip, stream, actions } = setup();
    const renderer = { drawFrame: vi.fn() };
    const createCutout = vi.fn(async () => renderer);
    const bubble = await openCameraBubble({ pip, camera: stream, createCutout, styleHref: CSS, ...actions });
    const video = win.document.querySelector('video');
    const canvas = win.document.querySelector('canvas.bubble-camera');
    expect(createCutout).toHaveBeenCalledWith(video, canvas);
    expect(video.hidden).toBe(true);
    const play = vi.spyOn(video, 'play').mockResolvedValue();
    bubble.showCamera(stream); // oculto, Chrome no lo reproduce con autoplay: hay que pedirlo
    expect(play).toHaveBeenCalledOnce();
    await settle();
    win.nextFrame(); // aún sin frames de cámara: no dibuja
    expect(renderer.drawFrame).not.toHaveBeenCalled();
    Object.defineProperties(video, { videoWidth: { value: 640 }, videoHeight: { value: 480 } });
    win.nextFrame();
    win.nextFrame();
    expect(renderer.drawFrame).toHaveBeenCalledTimes(2);
    bubble.close();
    win.nextFrame();
    expect(renderer.drawFrame).toHaveBeenCalledTimes(2);
  });

  it('si el recorte no carga, enseña la cámara tal cual y lo dice (CAM-BUG-0031)', async () => {
    const { win, pip, stream, actions } = setup();
    const onError = vi.fn();
    const failure = new Error('sin modelo');
    await openCameraBubble({ pip, camera: stream, createCutout: async () => { throw failure; }, onError, styleHref: CSS, ...actions });
    await settle();
    expect(win.document.querySelector('canvas')).toBeNull();
    expect(win.document.querySelector('video').hidden).toBe(false);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it('sin Document Picture-in-Picture falla con un mensaje claro', async () => {
    const { stream, actions } = setup();
    await expect(openCameraBubble({ pip: undefined, camera: stream, styleHref: CSS, ...actions }))
      .rejects.toThrow('Este navegador no puede mostrar la cámara flotando');
  });
});
