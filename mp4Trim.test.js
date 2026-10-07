import { describe, expect, it } from 'vitest';
import { trimMp4 } from './mp4Trim.js';

// MP4 fragmentado mínimo como lo graba Chrome: ftyp, moov (vídeo 30000 Hz y
// audio 48000 Hz) y un moof+mdat por segundo.
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u64 = n => [...u32(Math.floor(n / 2 ** 32)), ...u32(n >>> 0)];
const ascii = s => [...s].map(c => c.charCodeAt(0));
const box = (type, ...parts) => {
  const body = parts.flat();
  return [...u32(body.length + 8), ...ascii(type), ...body];
};
const trak = (id, handler, timescale) => box('trak',
  box('tkhd', u32(0), u32(0), u32(0), u32(id)),
  box('mdia',
    box('mdhd', u32(0), u32(0), u32(0), u32(timescale), u32(0)),
    box('hdlr', u32(0), u32(0), ascii(handler))));
const [SYNC, NON_SYNC] = [0x02000000, 0x01010000];
const traf = (id, decodeTime, firstFlags) => box('traf',
  box('tfhd', u32(0x020000), u32(id)),
  box('tfdt', u32(0x01000000), u64(decodeTime)),
  box('trun', u32(0x000005), u32(1), u32(0), u32(firstFlags)));
const fragment = (second, firstFlags = SYNC) => [
  ...box('moof', box('mfhd', u32(0), u32(second + 1)),
    traf(1, second * 30000, firstFlags), traf(2, second * 48000, SYNC)),
  ...box('mdat', [second, second, second]),
];
const mp4 = flags => Uint8Array.from([
  ...box('ftyp', ascii('isom'), u32(0)),
  ...box('moov', trak(1, 'vide', 30000), trak(2, 'soun', 48000)),
  ...flags.flatMap((f, second) => fragment(second, f)),
]);

// Lee de la salida: por fragmento, el contenido de su mdat y los tfdt de cada pista.
function fragmentsOf(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let decodeTimes = [];
  for (let at = 0; at < bytes.length; at += view.getUint32(at)) {
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (type === 'moof') {
      const moof = String.fromCharCode(...bytes.subarray(at, at + view.getUint32(at)));
      decodeTimes = [...moof.matchAll(/tfdt/g)].map(m => Number(view.getBigUint64(at + m.index + 8)));
    }
    if (type === 'mdat') out.push({ mdat: bytes[at + 8], decodeTimes });
  }
  return out;
}

describe('trimMp4 — recortar un MP4 fragmentado sin recodificar (CAM-TSK-0111)', () => {
  const allSync = [SYNC, SYNC, SYNC, SYNC, SYNC];

  it('conserva cabeceras y los fragmentos entre inicio y fin, con los tiempos desde 0', () => {
    const { bytes: out, startSec } = trimMp4(mp4(allSync), { startSec: 1.5, endSec: 3.2 });
    expect(startSec).toBe(1); // inicio real: el fragmento con fotograma clave
    expect(String.fromCharCode(...out.subarray(4, 8))).toBe('ftyp');
    expect(fragmentsOf(out)).toEqual([
      { mdat: 1, decodeTimes: [0, 0] },
      { mdat: 2, decodeTimes: [30000, 48000] },
      { mdat: 3, decodeTimes: [60000, 96000] },
    ]);
  });

  it('el inicio retrocede al último fragmento que empieza en fotograma clave', () => {
    const { bytes, startSec } = trimMp4(mp4([SYNC, SYNC, NON_SYNC, NON_SYNC, SYNC]), { startSec: 3.5, endSec: 99 });
    expect(fragmentsOf(bytes).map(f => f.mdat)).toEqual([1, 2, 3, 4]);
    expect(startSec).toBe(1);
  });

  it('de 0 al final sale igual', () => {
    const original = mp4(allSync);
    expect(trimMp4(original, { startSec: 0, endSec: 5 })).toEqual({ bytes: original, startSec: 0 });
  });

  it('si no es un MP4 fragmentado lo dice en vez de devolver algo roto', () => {
    expect(() => trimMp4(Uint8Array.from(box('ftyp', ascii('isom'))), { startSec: 0, endSec: 1 }))
      .toThrow(/fragmentado/);
  });

  it('un rango vacío o al revés es un error', () => {
    expect(() => trimMp4(mp4(allSync), { startSec: 3, endSec: 2 })).toThrow(/rango/);
  });
});
