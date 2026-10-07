import { describe, expect, it, vi } from 'vitest';
import { createMicTester, levelFromSamples } from './micTest.js';

describe('levelFromSamples — nivel 0..1 de una muestra de audio (CAM-TSK-0125)', () => {
  it('silencio (todo en 128) es 0', () => {
    expect(levelFromSamples(new Uint8Array(64).fill(128))).toBe(0);
  });

  it('una señal fuerte se acerca a 1 y nunca lo pasa', () => {
    const loud = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0));
    expect(levelFromSamples(loud)).toBe(1);
    const medium = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 160 : 96));
    expect(levelFromSamples(medium)).toBeGreaterThan(0.3);
    expect(levelFromSamples(medium)).toBeLessThan(1);
  });
});

function fakes() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const analyser = { fftSize: 0, getByteTimeDomainData: data => data.fill(200) };
  const context = {
    createMediaStreamSource: () => ({ connect: vi.fn() }),
    createAnalyser: () => analyser,
    close: vi.fn(async () => {}),
  };
  let frame = null;
  return {
    track, context,
    getUserMedia: vi.fn(async () => stream),
    createAudioContext: () => context,
    requestFrame: cb => { frame = cb; return 1; },
    cancelFrame: vi.fn(),
    tick: () => frame?.(),
  };
}

describe('createMicTester — probar el micrófono', () => {
  it('abre el micrófono elegido, avisa del nivel en cada frame y al parar lo suelta todo', async () => {
    const f = fakes();
    const levels = [];
    const tester = createMicTester({ ...f, onLevel: level => levels.push(level) });
    await tester.start('mic-2');
    expect(f.getUserMedia).toHaveBeenCalledWith({ audio: { deviceId: { exact: 'mic-2' } } });
    expect(tester.isRunning()).toBe(true);
    f.tick();
    f.tick();
    expect(levels).toHaveLength(2);
    expect(levels[0]).toBeGreaterThan(0.5);
    tester.stop();
    expect(f.track.stop).toHaveBeenCalled();
    expect(f.context.close).toHaveBeenCalled();
    expect(f.cancelFrame).toHaveBeenCalled();
    expect(tester.isRunning()).toBe(false);
  });

  it('si se para mientras el navegador aún abre el micrófono, al llegar se suelta', async () => {
    const f = fakes();
    let grant;
    f.getUserMedia.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
    const tester = createMicTester({ ...f, onLevel() {} });
    const pending = tester.start(null);
    tester.stop(); // p. ej. se empezó a presentar antes de conceder el permiso
    grant({ getTracks: () => [f.track] });
    await pending;
    expect(f.track.stop).toHaveBeenCalled();
    expect(tester.isRunning()).toBe(false);
  });

  it('sin micrófono elegido usa el predeterminado', async () => {
    const f = fakes();
    await createMicTester({ ...f, onLevel() {} }).start(null);
    expect(f.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it('sin permiso o sin micrófono, el error llega a quien lo pidió y no queda nada abierto', async () => {
    const f = fakes();
    f.getUserMedia.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'));
    const tester = createMicTester({ ...f, onLevel() {} });
    await expect(tester.start(null)).rejects.toThrow();
    expect(tester.isRunning()).toBe(false);
  });
});
