/**
 * Recortar la grabación según su formato (CAM-TSK-0127): MP4 por fragmentos,
 * WebM por clusters, sin recodificar. Devuelve también el inicio real del corte
 * (retrocede al fotograma clave anterior) para recortar los capítulos igual.
 */

import { trimMp4 } from './mp4Trim.js';
import { trimWebm } from './webmTrim.js';

const TRIMMERS = [[/mp4/i, trimMp4], [/webm/i, trimWebm]];

export async function trimRecording(blob, range) {
  const trim = TRIMMERS.find(([format]) => format.test(blob.type))?.[1];
  if (!trim) throw new Error(`no se puede recortar este formato de vídeo: ${blob.type || 'desconocido'}`);
  const { bytes, startSec } = trim(new Uint8Array(await blob.arrayBuffer()), range);
  return { blob: new Blob([bytes], { type: blob.type }), startSec };
}
