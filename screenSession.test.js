import { describe, expect, it, vi } from 'vitest';
import { createScreenSession } from './screenSession.js';

// Burbuja y flujo falsos: la burbuja guarda sus acciones para «pulsar» sus botones.
function setup({ openBubble, requestCamera } = {}) {
  let actions = null;
  const bubble = { setState: vi.fn(), showCamera: vi.fn(), close: vi.fn(() => actions.onClose()) };
  const flowState = { recording: false, paused: false };
  let notify = () => {};
  const flow = {
    start: vi.fn(async () => { flowState.recording = true; notify(); }),
    stop: vi.fn(() => { flowState.recording = false; notify(); }),
    togglePause: vi.fn(() => { flowState.paused = !flowState.paused; notify(); }),
    isRecording: () => flowState.recording,
    isPaused: () => flowState.paused,
  };
  const camera = { getTracks: () => [cameraTrack] };
  const cameraTrack = { stop: vi.fn() };
  const deps = {
    openBubble: openBubble ?? vi.fn(async options => { actions = options; return bubble; }),
    requestCamera: requestCamera ?? vi.fn(async () => camera),
    createFlow: onChange => { notify = onChange; return flow; },
    showStatus: vi.fn(),
    focusApp: vi.fn(),
    logger: { error: vi.fn() },
  };
  const session = createScreenSession(deps);
  return { session, deps, bubble, flow, camera, cameraTrack, press: name => actions[name]() };
}

describe('createScreenSession — grabar la pantalla con la burbuja (CAM-TSK-0165)', () => {
  it('abre la burbuja primero (gasta el permiso del clic) y luego le pone la cámara', async () => {
    const { session, deps, bubble, camera } = setup();
    await session.open();
    expect(deps.openBubble).toHaveBeenCalledOnce();
    expect(bubble.showCamera).toHaveBeenCalledWith(camera);
    await session.open(); // ya abierta: no abre otra
    expect(deps.openBubble).toHaveBeenCalledOnce();
  });

  it('REC graba, la burbuja sigue el estado y Parar cierra la burbuja y vuelve a onslide', async () => {
    const { session, deps, bubble, flow, press } = setup();
    await session.open();
    await press('onRecord');
    expect(flow.start).toHaveBeenCalledOnce();
    expect(bubble.setState).toHaveBeenLastCalledWith('recording');
    press('onPause');
    expect(bubble.setState).toHaveBeenLastCalledWith('paused');
    press('onStop');
    expect(flow.stop).toHaveBeenCalledOnce();
    expect(bubble.close).toHaveBeenCalledOnce();
    expect(deps.focusApp).toHaveBeenCalled();
  });

  it('cerrar la burbuja mientras se graba para la grabación', async () => {
    const { session, flow, bubble, press } = setup();
    await session.open();
    await press('onRecord');
    bubble.close();
    expect(flow.stop).toHaveBeenCalledOnce();
  });

  it('sin Document PiP lo avisa y no pide la cámara', async () => {
    const { session, deps } = setup({ openBubble: vi.fn(async () => { throw new Error('sin burbuja'); }) });
    await session.open();
    expect(deps.showStatus).toHaveBeenCalledWith('sin burbuja', true);
    expect(deps.requestCamera).not.toHaveBeenCalled();
  });

  it('sin cámara lo avisa y la burbuja sigue sirviendo para grabar la pantalla', async () => {
    const { session, deps, bubble } = setup({ requestCamera: vi.fn(async () => { throw new Error('denegada'); }) });
    await session.open();
    expect(deps.showStatus).toHaveBeenCalledWith('denegada', true);
    expect(bubble.close).not.toHaveBeenCalled();
  });

  it('si la burbuja se cerró antes de llegar la cámara, la suelta', async () => {
    const { promise, resolve } = Promise.withResolvers();
    const { session, bubble, camera, cameraTrack } = setup({ requestCamera: () => promise });
    const opening = session.open();
    await new Promise(r => setTimeout(r, 0)); // burbuja abierta, cámara aún pidiéndose
    bubble.close();
    resolve(camera);
    await opening;
    expect(cameraTrack.stop).toHaveBeenCalled();
    expect(bubble.showCamera).not.toHaveBeenCalled();
  });
});
