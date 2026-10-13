// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openCameraBubble } from './cameraBubble.js';
import { setLang } from './i18n.js';

// Ventana PiP falsa: un documento aparte y close() avisa con pagehide, como Chrome.
function fakePip() {
  const win = Object.assign(new EventTarget(), {
    document: document.implementation.createHTMLDocument(''),
    close: vi.fn(() => win.dispatchEvent(new Event('pagehide'))),
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

  it('sin Document Picture-in-Picture falla con un mensaje claro', async () => {
    const { stream, actions } = setup();
    await expect(openCameraBubble({ pip: undefined, camera: stream, styleHref: CSS, ...actions }))
      .rejects.toThrow('Este navegador no puede mostrar la cámara flotando');
  });
});
