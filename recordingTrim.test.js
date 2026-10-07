import { describe, expect, it, vi } from 'vitest';

vi.mock('./mp4Trim.js', () => ({ trimMp4: vi.fn(() => ({ bytes: Uint8Array.of(4), startSec: 1 })) }));
vi.mock('./webmTrim.js', () => ({ trimWebm: vi.fn(() => ({ bytes: Uint8Array.of(9), startSec: 2 })) }));

const { trimRecording } = await import('./recordingTrim.js');
const { trimMp4 } = await import('./mp4Trim.js');

describe('trimRecording — recortar la grabación según su formato (CAM-TSK-0127)', () => {
  it('un MP4 va al recortador de MP4 y conserva su tipo y el inicio real del corte', async () => {
    const result = await trimRecording(new Blob([Uint8Array.of(1, 2)], { type: 'video/mp4;codecs=avc1' }), { startSec: 1.5, endSec: 3 });
    expect(trimMp4).toHaveBeenCalledWith(Uint8Array.of(1, 2), { startSec: 1.5, endSec: 3 });
    expect(result.startSec).toBe(1);
    expect(result.blob.type).toBe('video/mp4;codecs=avc1');
    expect([...new Uint8Array(await result.blob.arrayBuffer())]).toEqual([4]);
  });

  it('un WebM va al recortador de WebM', async () => {
    const result = await trimRecording(new Blob([], { type: 'video/webm' }), { startSec: 2, endSec: 3 });
    expect(result.startSec).toBe(2);
  });

  it('otro formato es un error, no un recorte silencioso', async () => {
    await expect(trimRecording(new Blob([], { type: 'video/ogg' }), { startSec: 0, endSec: 1 })).rejects.toThrow(/formato/);
  });
});
