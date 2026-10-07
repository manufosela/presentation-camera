import { describe, expect, it } from 'vitest';
import { trimWebm } from './webmTrim.js';

// WebM como el de Chrome: tamaños desconocidos, vídeo (1) en BlockGroup, audio (2) en SimpleBlock.
const UNKNOWN = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const size8 = n => [0x01, 0, 0, 0, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const el = (id, ...parts) => { const body = parts.flat(); return [...id, ...size8(body.length), ...body]; };
const open = (id, ...parts) => [...id, ...UNKNOWN, ...parts.flat()];
const float64 = value => { const out = new Uint8Array(8); new DataView(out.buffer).setFloat64(0, value); return [...out]; };
const block = (track, flags, mark) => [0x80 | track, 0, 0, flags, mark];
const cluster = (second, isKey) => open([0x1f, 0x43, 0xb6, 0x75],
  el([0xe7], [(second * 1000) >> 8, (second * 1000) & 255]),
  el([0xa0], el([0xa1], block(1, 0, second)), isKey ? [] : el([0xfb], [0xff])),
  el([0xa3], block(2, 0x80, second)));
const webm = keys => Uint8Array.from([
  ...el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], [0x77, 0x65, 0x62, 0x6d])),
  ...open([0x18, 0x53, 0x80, 0x67],
    el([0x11, 0x4d, 0x9b, 0x74], [0xec, 0x80]), // SeekHead: con el recorte apuntaría mal
    el([0x15, 0x49, 0xa9, 0x66], el([0x2a, 0xd7, 0xb1], [0x0f, 0x42, 0x40]), el([0x44, 0x89], float64(keys.length * 1000))),
    el([0x16, 0x54, 0xae, 0x6b],
      el([0xae], el([0xd7], [1]), el([0x83], [1])),
      el([0xae], el([0xd7], [2]), el([0x83], [2]))),
    keys.flatMap((isKey, second) => cluster(second, isKey))),
]);

// Lee de la salida: Duration de Info y, por cluster, su Timecode y la marca de sus bloques.
function read(bytes) {
  const vint = (at, keep) => {
    const length = Math.clz32(bytes[at]) - 23;
    let value = keep ? bytes[at] : bytes[at] & (0xff >> length);
    for (let i = 1; i < length; i += 1) value = value * 256 + bytes[at + i];
    return { length, value, unknown: !keep && value === 2 ** (7 * length) - 1 };
  };
  const out = { clusters: [], hasSeekHead: false };
  const walk = (at, end) => {
    while (at < end) {
      const id = vint(at, true);
      const size = vint(at + id.length, false);
      const data = at + id.length + size.length;
      if (id.value === 0x1f43b675) out.clusters.push({ timecode: null, marks: [] });
      if (id.value === 0x114d9b74) out.hasSeekHead = true;
      if (id.value === 0x4489) out.duration = new DataView(bytes.buffer).getFloat64(data);
      if (id.value === 0xe7) out.clusters.at(-1).timecode = bytes.slice(data, data + size.value).reduce((v, b) => v * 256 + b, 0);
      if (id.value === 0xa3 || id.value === 0xa1) out.clusters.at(-1).marks.push(bytes[data + 4]);
      const isParent = [0x18538067, 0x1f43b675, 0x1549a966, 0xa0].includes(id.value);
      at = isParent ? data : data + size.value;
      if (isParent && !size.unknown) { walk(data, data + size.value); at = data + size.value; }
    }
  };
  walk(0, bytes.length);
  return out;
}

describe('trimWebm — recortar un WebM sin recodificar (CAM-TSK-0126)', () => {
  it('conserva los clusters del rango con los tiempos desde 0 y la duración nueva', () => {
    const out = read(trimWebm(webm([true, true, true, true, true]), { startSec: 1.5, endSec: 3.2 }));
    expect(out.clusters).toEqual([
      { timecode: 0, marks: [1, 1] },
      { timecode: 1000, marks: [2, 2] },
      { timecode: 2000, marks: [3, 3] },
    ]);
    expect(out.duration).toBe(2000);
    expect(out.hasSeekHead).toBe(false);
  });

  it('el inicio retrocede al último cluster que abre con fotograma clave de vídeo', () => {
    const out = read(trimWebm(webm([true, true, false, false, true]), { startSec: 3.5, endSec: 99 }));
    expect(out.clusters.map(c => c.marks[0])).toEqual([1, 2, 3, 4]);
  });

  it('si no es un WebM o el rango va al revés lo dice en vez de devolver algo roto', () => {
    expect(() => trimWebm(Uint8Array.of(0, 0, 0, 0), { startSec: 0, endSec: 1 })).toThrow(/WebM/);
    expect(() => trimWebm(webm([true, true]), { startSec: 2, endSec: 1 })).toThrow(/rango/);
  });
});
