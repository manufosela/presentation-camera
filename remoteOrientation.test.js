import { describe, expect, it, vi } from 'vitest';
import { lockPortrait } from './remoteOrientation.js';

describe('lockPortrait', () => {
  it('bloquea en vertical cuando el navegador lo permite', async () => {
    const orientation = { lock: vi.fn(async () => {}) };
    await expect(lockPortrait(orientation)).resolves.toBe(true);
    expect(orientation.lock).toHaveBeenCalledWith('portrait');
  });

  it('no falla en una pestaña normal, donde el bloqueo se rechaza', async () => {
    const orientation = { lock: vi.fn(async () => { throw new DOMException('no', 'NotSupportedError'); }) };
    await expect(lockPortrait(orientation)).resolves.toBe(false);
  });

  it('no falla en navegadores sin la API de orientación', async () => {
    await expect(lockPortrait(undefined)).resolves.toBe(false);
    await expect(lockPortrait({})).resolves.toBe(false);
  });
});
