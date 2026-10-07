// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatSize, renderRecoveryNotice } from './recoveryNotice.js';
import { setLang } from './i18n.js';

beforeEach(() => setLang('es', null));

const session = (overrides = {}) => ({
  id: 'rec-1', mimeType: 'video/webm', startedAt: Date.UTC(2026, 9, 7, 12, 20), size: 125 * 1024 * 1024, ...overrides,
});

describe('renderRecoveryNotice — grabación sin terminar al abrir (CAM-TSK-0122)', () => {
  it('sin sesiones pendientes no muestra nada', () => {
    const box = document.createElement('div');
    renderRecoveryNotice(box, [], { onDownload: vi.fn(), onDiscard: vi.fn() });
    expect(box.hidden).toBe(true);
    expect(box.children).toHaveLength(0);
  });

  it('muestra cada una con fecha y tamaño y sus botones Descargar y Descartar', () => {
    const box = document.createElement('div');
    const onDownload = vi.fn();
    const onDiscard = vi.fn();
    const pending = session();
    renderRecoveryNotice(box, [pending], { onDownload, onDiscard });
    expect(box.hidden).toBe(false);
    expect(box.textContent).toContain('Tienes una grabación sin terminar');
    expect(box.textContent).toContain('125 MB');
    expect(box.textContent).toContain('2026');
    const [download, discard] = box.querySelectorAll('button');
    expect(download.textContent).toBe('Descargar');
    expect(discard.textContent).toBe('Descartar');
    download.click();
    discard.click();
    expect(onDownload).toHaveBeenCalledWith(pending);
    expect(onDiscard).toHaveBeenCalledWith(pending);
  });

  it('en inglés', () => {
    setLang('en', null);
    const box = document.createElement('div');
    renderRecoveryNotice(box, [session()], { onDownload: vi.fn(), onDiscard: vi.fn() });
    expect(box.textContent).toContain('You have an unfinished recording');
  });
});

describe('formatSize', () => {
  it.each([[500 * 1024, 'KB'], [125 * 1024 * 1024, '125 MB'], [2.5 * 1024 ** 3, '2,5 GB']])('%d bytes → %s', (bytes, expected) => {
    expect(formatSize(bytes)).toContain(expected);
  });
});
