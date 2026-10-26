import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './withTimeout.js';

afterEach(() => vi.useRealTimers());

describe('withTimeout', () => {
  it('devuelve el resultado si llega a tiempo', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('propaga el error de la promesa', async () => {
    await expect(withTimeout(Promise.reject(new Error('caída')), 1000)).rejects.toThrow('caída');
  });

  it('falla con un TimeoutError si no hay respuesta en el plazo', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 1000);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});
