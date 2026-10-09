import { describe, expect, it } from 'vitest';
import { uploadNames } from './uploadNames.js';

// 23:30 UTC del 9 de octubre = 01:30 del 10 en Madrid.
const LATE = Date.UTC(2026, 9, 9, 23, 30);

describe('uploadNames — carpeta y fichero de cada grabación (CAM-TSK-0150)', () => {
  it('carpeta «AAAA-MM-DD Ponente» en hora de Madrid y fichero con el título', () => {
    expect(uploadNames({ speaker: 'Ana Ruiz', title: 'Mi charla', mimeType: 'video/webm', nowMs: LATE }))
      .toEqual({ folder: '2026-10-10 Ana Ruiz', file: 'Mi charla.webm' });
  });

  it('mp4 y título vacío', () => {
    expect(uploadNames({ speaker: 'Ana', title: '  ', mimeType: 'video/mp4; codecs=avc1', nowMs: LATE }).file).toBe('Grabación.mp4');
  });

  it('quita barras, caracteres de control y espacios de más, y recorta lo largo', () => {
    const { folder, file } = uploadNames({ speaker: ' ../Ana\u0000 /x ', title: `a/b\\c${'z'.repeat(200)}`, mimeType: 'video/webm', nowMs: LATE });
    expect(folder).toBe('2026-10-10 ..-Ana -x');
    expect(file).not.toMatch(/[/\\]/);
    expect(file.length).toBeLessThanOrEqual(105);
  });

  it('rechaza un tipo que no es vídeo de grabación', () => {
    expect(() => uploadNames({ speaker: 'Ana', title: 't', mimeType: 'text/html', nowMs: LATE })).toThrow('mimeType');
  });
});
