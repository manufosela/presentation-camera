/**
 * Duración en la cabecera del WebM (CAM-TSK-0123).
 *
 * MediaRecorder escribe el WebM sin Duration, así que los reproductores no
 * muestran la barra de tiempo ni dejan avanzar bien. Se parchea solo la
 * cabecera: se añade Duration a Segment > Info. Chrome escribe Segment con
 * tamaño desconocido, así que Info puede crecer sin tocar nada más, y el resto
 * del vídeo se reaprovecha tal cual (new Blob), sin copiarlo a memoria.
 */

const HEAD_BYTES = 64 * 1024;
const ID = Object.freeze({ EBML: 0x1a45dfa3, SEGMENT: 0x18538067, INFO: 0x1549a966, SEEK_HEAD: 0x114d9b74, VOID: 0xec, TIMECODE_SCALE: 0x2ad7b1, DURATION: 0x4489 });

// Entero de longitud variable de EBML: la posición del primer 1 da su longitud.
function readVint(bytes, pos, keepMarker) {
  const first = bytes[pos];
  if (!first) throw new Error(`EBML: vint no válido en ${pos}`);
  const length = Math.clz32(first) - 23;
  let value = keepMarker ? first : first & (0xff >> length);
  for (let i = 1; i < length; i += 1) value = value * 256 + bytes[pos + i];
  return { length, value };
}

const readUint = (bytes, start, end) => bytes.slice(start, end).reduce((value, byte) => value * 256 + byte, 0);

function readElement(bytes, start) {
  const id = readVint(bytes, start, true);
  const size = readVint(bytes, start + id.length, false);
  const dataStart = start + id.length + size.length;
  return { id: id.value, start, idLength: id.length, sizeLength: size.length, dataStart, end: dataStart + size.value };
}

function encodeVint(value, preferredLength) {
  const fits = length => value < 2 ** (7 * length) - 1;
  let length = preferredLength;
  while (!fits(length)) length += 1;
  const out = new Uint8Array(length);
  let rest = value;
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  out[0] |= 0x80 >> (length - 1);
  return out;
}

function findInfo(head) {
  const ebml = readElement(head, 0);
  if (ebml.id !== ID.EBML) throw new Error('EBML: no empieza por la cabecera EBML');
  const segment = readElement(head, ebml.end);
  if (segment.id !== ID.SEGMENT) throw new Error('EBML: no hay Segment');
  for (let pos = segment.dataStart; pos < head.length;) {
    const element = readElement(head, pos);
    if (element.id === ID.INFO) return element;
    if (element.id !== ID.SEEK_HEAD && element.id !== ID.VOID) break;
    pos = element.end;
  }
  throw new Error('EBML: no se encontró Info al principio del Segment');
}

/** El vídeo con su duración (en ms) escrita; otro formato o ya con duración, tal cual. */
export async function withWebmDuration(blob, durationMs) {
  if (!/webm/i.test(blob.type)) return blob;
  try {
    const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
    const info = findInfo(head);
    if (info.end > head.length) throw new Error('EBML: Info no cabe en la cabecera leída');
    let timecodeScale = 1_000_000; // ns por unidad (valor por defecto de Matroska)
    for (let pos = info.dataStart; pos < info.end;) {
      const child = readElement(head, pos);
      if (child.id === ID.DURATION) return blob;
      if (child.id === ID.TIMECODE_SCALE) timecodeScale = readUint(head, child.dataStart, child.end);
      pos = child.end;
    }
    const duration = new Uint8Array(11);
    duration.set([0x44, 0x89, 0x88]);
    new DataView(duration.buffer).setFloat64(3, (durationMs * 1_000_000) / timecodeScale);
    const body = new Uint8Array([...head.slice(info.dataStart, info.end), ...duration]);
    const infoHeader = new Uint8Array([...head.slice(info.start, info.start + info.idLength), ...encodeVint(body.length, info.sizeLength)]);
    return new Blob([head.slice(0, info.start), infoHeader, body, blob.slice(info.end)], { type: blob.type });
  } catch (error) {
    console.warn('[rec] no se pudo escribir la duración del WebM; se descarga sin ella', error);
    return blob;
  }
}
