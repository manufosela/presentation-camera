import { describe, expect, it } from 'vitest';
import { formatVersion, loadVersion, parseVersion } from './appVersion.js';

describe('parseVersion — valida version.json', () => {
  it('acepta {version, commit, date}', () => {
    expect(parseVersion({ version: '1.0.0', commit: 'abc1234', date: '2026-10-04' }))
      .toEqual({ version: '1.0.0', commit: 'abc1234', date: '2026-10-04' });
  });

  it('rechaza formas incompletas o con tipos raros', () => {
    expect(parseVersion({ version: '1.0.0' })).toBeNull();
    expect(parseVersion({ version: 1, commit: 'a', date: 'b' })).toBeNull();
    expect(parseVersion(null)).toBeNull();
  });
});

describe('formatVersion — texto del pie', () => {
  it('versión publicada', () => {
    expect(formatVersion({ version: '1.0.0', commit: 'abc1234', date: '2026-10-04' })).toBe('v1.0.0 · abc1234 · 2026-10-04');
  });

  it('sin version.json (servida en local, sin publicar)', () => {
    expect(formatVersion(null)).toBe('Versión de desarrollo (sin publicar)');
  });
});

describe('loadVersion — lee version.json', () => {
  const response = (status, body) => async () => ({ ok: status === 200, status, json: async () => body });

  it('200 con JSON válido → info', async () => {
    expect(await loadVersion(response(200, { version: '1.0.0', commit: 'abc1234', date: '2026-10-04' })))
      .toEqual({ version: '1.0.0', commit: 'abc1234', date: '2026-10-04' });
  });

  it('404 (en local no existe) → null', async () => {
    expect(await loadVersion(response(404, null))).toBeNull();
  });

  it('JSON con forma inválida → null', async () => {
    expect(await loadVersion(response(200, { nope: true }))).toBeNull();
  });

  it('error de red → null', async () => {
    expect(await loadVersion(async () => { throw new TypeError('offline'); })).toBeNull();
  });
});
