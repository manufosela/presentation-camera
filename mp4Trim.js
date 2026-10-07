/**
 * Recortar un MP4 fragmentado sin recodificar (CAM-TSK-0111).
 *
 * Chrome graba fMP4: ftyp, moov y luego pares moof+mdat. Un fragmento cuyo
 * primer sample de vídeo es fotograma clave puede abrir el vídeo, así que el
 * recorte conserva las cabeceras y los fragmentos del rango (el inicio retrocede
 * al fragmento con fotograma clave anterior) y resta a cada tfdt el del primer
 * fragmento conservado de su pista, para que los tiempos empiecen en 0.
 */

const NON_SYNC_SAMPLE = 0x00010000; // sample_is_non_sync_sample (ISO 14496-12)
const [TRUN_DATA_OFFSET, TRUN_FIRST_SAMPLE_FLAGS, TFHD_DEFAULT_SAMPLE_FLAGS] = [0x000001, 0x000004, 0x000020];
const TFHD_FIELDS = [[0x000001, 8], [0x000002, 4], [0x000008, 4], [0x000010, 4]];

function boxesIn(bytes, view, start, end) {
  const boxes = [];
  for (let at = start; at + 8 <= end;) {
    const size = view.getUint32(at);
    if (size < 8 || at + size > end) throw new Error('MP4 con una caja de tamaño no válido');
    boxes.push({ type: String.fromCharCode(...bytes.subarray(at + 4, at + 8)), start: at, end: at + size });
    at += size;
  }
  return boxes;
}

const child = (bytes, view, parent, type) => boxesIn(bytes, view, parent.start + 8, parent.end).find(b => b.type === type);

function readTracks(bytes, view, moov) {
  const tracks = new Map(); // track_ID → { timescale, isVideo }
  for (const trak of boxesIn(bytes, view, moov.start + 8, moov.end).filter(b => b.type === 'trak')) {
    const tkhd = child(bytes, view, trak, 'tkhd');
    const id = view.getUint32(tkhd.start + 8 + (bytes[tkhd.start + 8] === 1 ? 20 : 12));
    const mdia = child(bytes, view, trak, 'mdia');
    const mdhd = child(bytes, view, mdia, 'mdhd');
    const timescale = view.getUint32(mdhd.start + 8 + (bytes[mdhd.start + 8] === 1 ? 20 : 12));
    const hdlr = child(bytes, view, mdia, 'hdlr');
    tracks.set(id, { timescale, isVideo: String.fromCharCode(...bytes.subarray(hdlr.start + 16, hdlr.start + 20)) === 'vide' });
  }
  return tracks;
}

function readTraf(bytes, view, traf) {
  const tfhd = child(bytes, view, traf, 'tfhd');
  const tfhdFlags = view.getUint32(tfhd.start + 8) & 0xffffff;
  const trackId = view.getUint32(tfhd.start + 12);
  let field = tfhd.start + 16;
  for (const [flag, size] of TFHD_FIELDS) if (tfhdFlags & flag) field += size;
  let firstFlags = tfhdFlags & TFHD_DEFAULT_SAMPLE_FLAGS ? view.getUint32(field) : NON_SYNC_SAMPLE;
  const trun = child(bytes, view, traf, 'trun');
  const trunFlags = view.getUint32(trun.start + 8) & 0xffffff;
  if (trunFlags & TRUN_FIRST_SAMPLE_FLAGS) firstFlags = view.getUint32(trun.start + 16 + (trunFlags & TRUN_DATA_OFFSET ? 4 : 0));
  const tfdt = child(bytes, view, traf, 'tfdt');
  if (!tfdt) throw new Error('MP4 fragmentado sin tfdt: no se puede recortar');
  const isWide = bytes[tfdt.start + 8] === 1;
  const decodeTime = isWide ? Number(view.getBigUint64(tfdt.start + 12)) : view.getUint32(tfdt.start + 12);
  return { trackId, decodeTime, tfdtAt: tfdt.start + 12, isWide, isSync: !(firstFlags & NON_SYNC_SAMPLE) };
}

export function trimMp4(bytes, { startSec, endSec }) {
  if (!(startSec >= 0 && endSec > startSec)) throw new Error(`rango de recorte no válido: ${startSec}–${endSec}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = boxesIn(bytes, view, 0, bytes.length);
  const moov = top.find(b => b.type === 'moov');
  const firstMoof = top.findIndex(b => b.type === 'moof');
  if (!moov || firstMoof < 0) throw new Error('no es un MP4 fragmentado: no se puede recortar');
  const tracks = readTracks(bytes, view, moov);
  const videoId = [...tracks].find(([, track]) => track.isVideo)?.[0];

  const fragments = [];
  for (let i = firstMoof; i < top.length; i += 1) {
    if (top[i].type !== 'moof') continue;
    const mdat = top[i + 1]?.type === 'mdat' ? top[i + 1] : null;
    const trafs = boxesIn(bytes, view, top[i].start + 8, top[i].end).filter(b => b.type === 'traf').map(b => readTraf(bytes, view, b));
    const video = trafs.find(t => t.trackId === videoId) ?? trafs[0];
    fragments.push({ moof: top[i], mdat, trafs, time: video.decodeTime / tracks.get(video.trackId).timescale, isSync: video.isSync });
  }

  const opening = fragments.findLastIndex(f => f.isSync && f.time <= startSec);
  const kept = fragments.slice(Math.max(opening, 0)).filter(f => f.time < endSec);
  if (!kept.length) throw new Error('MP4 sin fragmentos en el rango: no se puede recortar');
  const fragmentOf = new Map(kept.map(f => [f.moof, f]));
  const pieces = [...top.slice(0, firstMoof), ...kept.flatMap(f => (f.mdat ? [f.moof, f.mdat] : [f.moof]))];
  const out = new Uint8Array(pieces.reduce((sum, b) => sum + b.end - b.start, 0));
  const outView = new DataView(out.buffer);
  const baseOf = new Map();
  let at = 0;
  for (const piece of pieces) {
    out.set(bytes.subarray(piece.start, piece.end), at);
    for (const traf of fragmentOf.get(piece)?.trafs ?? []) {
      if (!baseOf.has(traf.trackId)) baseOf.set(traf.trackId, traf.decodeTime);
      const rebased = traf.decodeTime - baseOf.get(traf.trackId);
      const where = at + traf.tfdtAt - piece.start;
      if (traf.isWide) outView.setBigUint64(where, BigInt(rebased));
      else outView.setUint32(where, rebased);
    }
    at += piece.end - piece.start;
  }
  return { bytes: out, startSec: kept[0].time }; // inicio real: retrocede al fotograma clave
}
