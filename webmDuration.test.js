import { describe, expect, it } from 'vitest';
import { withWebmDuration } from './webmDuration.js';

// Cabecera como la de MediaRecorder en Chrome: EBML, Segment de tamaño
// desconocido e Info sin Duration (TimecodeScale = 1 ms).
const EBML = [0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x86, 0x81, 0x01];
const SEGMENT = [0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const INFO_BODY = [0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40, 0x4d, 0x80, 0x86, 0x43, 0x68, 0x72, 0x6f, 0x6d, 0x65];
const INFO = [0x15, 0x49, 0xa9, 0x66, 0x80 | INFO_BODY.length, ...INFO_BODY];
const REST = [0x16, 0x54, 0xae, 0x6b, 0x81, 0x00, 0x1f, 0x43, 0xb6, 0x75, 0x81, 0x00];
const webm = (info = INFO) => new Blob([new Uint8Array([...EBML, ...SEGMENT, ...info, ...REST])], { type: 'video/webm;codecs=vp9' });
const bytes = async blob => [...new Uint8Array(await blob.arrayBuffer())];

describe('withWebmDuration — duración en la cabecera del WebM (CAM-TSK-0123)', () => {
  it('añade Duration a Info, ajusta su tamaño y deja el resto intacto', async () => {
    const out = await bytes(await withWebmDuration(webm(), 83_500));
    const infoAt = EBML.length + SEGMENT.length;
    expect(out.slice(0, infoAt)).toEqual([...EBML, ...SEGMENT]);
    expect(out.slice(infoAt, infoAt + 4)).toEqual([0x15, 0x49, 0xa9, 0x66]);
    expect(out[infoAt + 4]).toBe(0x80 | (INFO_BODY.length + 11)); // + id(2) + tamaño(1) + float64(8)
    const duration = out.slice(infoAt + 5 + INFO_BODY.length, infoAt + 5 + INFO_BODY.length + 11);
    expect(duration.slice(0, 3)).toEqual([0x44, 0x89, 0x88]);
    expect(new DataView(new Uint8Array(duration.slice(3)).buffer).getFloat64(0)).toBe(83_500); // en ms (escala 1 ms)
    expect(out.slice(-REST.length)).toEqual(REST);
  });

  it('conserva el tipo del vídeo', async () => {
    expect((await withWebmDuration(webm(), 1000)).type).toBe('video/webm;codecs=vp9');
  });

  it('si ya tiene duración, no lo toca', async () => {
    const withDuration = [0x15, 0x49, 0xa9, 0x66, 0x80 | 11, 0x44, 0x89, 0x88, 0x40, 0x8f, 0x40, 0, 0, 0, 0, 0];
    const original = webm(withDuration);
    expect(await withWebmDuration(original, 5000)).toBe(original);
  });

  it('un MP4 u otro formato se devuelve tal cual', async () => {
    const mp4 = new Blob(['ftyp'], { type: 'video/mp4' });
    expect(await withWebmDuration(mp4, 1000)).toBe(mp4);
  });

  it('una cabecera inesperada se devuelve tal cual (se avisa en consola)', async () => {
    const broken = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/webm' });
    expect(await withWebmDuration(broken, 1000)).toBe(broken);
  });
});
