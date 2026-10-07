/**
 * Recortar un WebM sin recodificar (CAM-TSK-0126).
 *
 * Chrome graba Segment y Clusters con tamaño desconocido, ~1 cluster por segundo.
 * Se conservan la cabecera (sin SeekHead ni Cues: apuntarían mal) y los clusters
 * del rango desde el que abre con fotograma clave de vídeo, con su Timecode
 * rebasado a 0 y la duración nueva en Info.
 */

import { encodeVint, readElement, readUint, readVint } from './webmDuration.js';

const ID = Object.freeze({ EBML: 0x1a45dfa3, SEGMENT: 0x18538067, CLUSTER: 0x1f43b675, CUES: 0x1c53bb6b,
  SEEK_HEAD: 0x114d9b74, INFO: 0x1549a966, TRACKS: 0x1654ae6b, TRACK_ENTRY: 0xae, TRACK_NUMBER: 0xd7, TRACK_TYPE: 0x83,
  TIMECODE_SCALE: 0x2ad7b1, DURATION: 0x4489, TIMECODE: 0xe7, SIMPLE_BLOCK: 0xa3, BLOCK_GROUP: 0xa0, BLOCK: 0xa1, REFERENCE_BLOCK: 0xfb });
// Elementos hijos de Segment: dentro de un cluster de tamaño desconocido marcan su final.
const SEGMENT_LEVEL = new Set([ID.CLUSTER, ID.CUES, ID.SEEK_HEAD, ID.INFO, ID.TRACKS, 0x1254c367, 0x1941a469, 0x1043a770]);
const UNKNOWN_SIZE = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

// Tamaño desconocido = todos los bits de valor a 1 (en 8 bytes no cabe exacto en un Number).
function isUnknown(bytes, element) {
  const size = bytes.subarray(element.start + element.idLength, element.dataStart);
  const mask = 0xff >> size.length;
  return (size[0] & mask) === mask && size.subarray(1).every(byte => byte === 0xff);
}
const idBytes = (bytes, element) => [...bytes.subarray(element.start, element.start + element.idLength)];

function childrenOf(bytes, start, end, stopAt) {
  const children = [];
  for (let pos = start; pos < end;) {
    const child = readElement(bytes, pos);
    if (stopAt?.has(child.id)) break;
    children.push(child);
    pos = child.end;
  }
  return children;
}

function timecodeElement(ticks) {
  const out = Uint8Array.of(ID.TIMECODE, 0x84, 0, 0, 0, 0); // uint de 4 bytes
  new DataView(out.buffer).setUint32(2, ticks);
  return out;
}

function videoTrackOf(bytes, tracks) {
  for (const entry of childrenOf(bytes, tracks.dataStart, tracks.end).filter(c => c.id === ID.TRACK_ENTRY)) {
    const fields = childrenOf(bytes, entry.dataStart, entry.end);
    const value = id => { const f = fields.find(c => c.id === id); return f && readUint(bytes, f.dataStart, f.end); };
    if (value(ID.TRACK_TYPE) === 1) return value(ID.TRACK_NUMBER); // TrackType 1 = vídeo
  }
  return null;
}

function readCluster(bytes, cluster, videoTrack) {
  const children = childrenOf(bytes, cluster.dataStart, isUnknown(bytes, cluster) ? bytes.length : cluster.end, SEGMENT_LEVEL);
  const timecodeEl = children.find(c => c.id === ID.TIMECODE);
  if (!timecodeEl) throw new Error('WebM: cluster sin Timecode, no se puede recortar');
  const timecode = readUint(bytes, timecodeEl.dataStart, timecodeEl.end);
  const blocks = [];
  for (const child of children) {
    const group = child.id === ID.BLOCK_GROUP ? childrenOf(bytes, child.dataStart, child.end) : null;
    const block = group ? group.find(c => c.id === ID.BLOCK) : child.id === ID.SIMPLE_BLOCK && child;
    if (!block) continue;
    const track = readVint(bytes, block.dataStart, false);
    const relative = new DataView(bytes.buffer, bytes.byteOffset).getInt16(block.dataStart + track.length);
    const isKey = group ? !group.some(c => c.id === ID.REFERENCE_BLOCK) : (bytes[block.dataStart + track.length + 2] & 0x80) !== 0;
    blocks.push({ track: track.value, time: timecode + relative, isKey });
  }
  const firstVideo = blocks.find(b => b.track === videoTrack);
  return { cluster, timecode, end: children.at(-1)?.end ?? cluster.dataStart, body: children.filter(c => c !== timecodeEl), blocks, opens: !firstVideo || firstVideo.isKey };
}

export function trimWebm(bytes, { startSec, endSec }) {
  if (!(startSec >= 0 && endSec > startSec)) throw new Error(`rango de recorte no válido: ${startSec}–${endSec}`);
  if (bytes.length < 4 || readUint(bytes, 0, 4) !== ID.EBML) throw new Error('no es un WebM: no se puede recortar');
  const segment = readElement(bytes, readElement(bytes, 0).end);
  if (segment.id !== ID.SEGMENT) throw new Error('WebM sin Segment: no se puede recortar');
  const header = [];
  const clusters = [];
  let scale = 1_000_000; // ns por tick (valor por defecto de Matroska)
  let videoTrack = null;
  for (let pos = segment.dataStart; pos < Math.min(segment.end, bytes.length);) {
    const element = readElement(bytes, pos);
    if (element.id === ID.CLUSTER) {
      clusters.push(readCluster(bytes, element, videoTrack));
      pos = clusters.at(-1).end;
      continue;
    }
    if (element.id === ID.TRACKS) videoTrack = videoTrackOf(bytes, element);
    if (element.id === ID.INFO) {
      const scaleEl = childrenOf(bytes, element.dataStart, element.end).find(c => c.id === ID.TIMECODE_SCALE);
      if (scaleEl) scale = readUint(bytes, scaleEl.dataStart, scaleEl.end);
    }
    if (element.id !== ID.SEEK_HEAD && element.id !== ID.CUES && !clusters.length) header.push(element);
    pos = element.end;
  }
  const toTicks = seconds => (seconds * 1e9) / scale;
  const opening = clusters.findLastIndex(c => c.opens && c.timecode <= toTicks(startSec));
  const kept = clusters.slice(Math.max(opening, 0)).filter(c => c.timecode < toTicks(endSec));
  if (!kept.length) throw new Error('WebM sin clusters en el rango: no se puede recortar');
  const base = kept[0].timecode;
  const duration = Math.max(...kept.at(-1).blocks.map(b => b.time), kept.at(-1).timecode) - base;
  // Por trozos (subarray, sin copiar) y una sola copia al final: el vídeo puede ocupar cientos de MB.
  const pieces = [bytes.subarray(0, segment.start + segment.idLength), UNKNOWN_SIZE];
  for (const element of header) {
    if (element.id !== ID.INFO) { pieces.push(bytes.subarray(element.start, element.end)); continue; }
    const body = childrenOf(bytes, element.dataStart, element.end).filter(c => c.id !== ID.DURATION).flatMap(c => [...bytes.subarray(c.start, c.end)]);
    const durationEl = new Uint8Array(11);
    durationEl.set([0x44, 0x89, 0x88]);
    new DataView(durationEl.buffer).setFloat64(3, duration);
    pieces.push(idBytes(bytes, element), encodeVint(body.length + 11, element.sizeLength), body, durationEl);
  }
  for (const { cluster, timecode, body } of kept) {
    pieces.push(idBytes(bytes, cluster), UNKNOWN_SIZE, timecodeElement(timecode - base));
    for (const child of body) pieces.push(bytes.subarray(child.start, child.end));
  }
  const out = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
  let at = 0;
  for (const piece of pieces) { out.set(piece, at); at += piece.length; }
  return { bytes: out, startSec: (base * scale) / 1e9 }; // inicio real: retrocede al fotograma clave
}
