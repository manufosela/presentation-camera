/**
 * Descarga los pesos de BodyPix que usa el recorte (CAM-TSK-0039).
 *
 * El modelo (2,6 MB) no se versiona: lo descarga el workflow de Pages al
 * publicar (models/bodypix/ dentro del sitio) y, en local, `npm run
 * fetch-model`. Cada fichero se comprueba contra su sha256 fijado aquí: si
 * Google lo cambia o la descarga se altera, falla en vez de publicar otra cosa.
 *
 * Uso: node scripts/fetch-model.mjs <directorio-destino>
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile as fsWriteFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** MobileNetV1, multiplier 0.75, stride 16, quantBytes 2 (lo que pide precam.js). */
export const MODEL_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/mobilenet/quant2/075/';

export const MODEL_FILES = [
  { name: 'model-stride16.json', sha256: '7c9b3bd68f86004b75e739255b9b823c4d8f409fabe6dd753b76c0fdd90a357e' },
  { name: 'group1-shard1of1.bin', sha256: 'e215c9546b9db0e1e06c23c759ed48ccaf2aad68c656d0130b5757bc0479ac77' },
];

export async function fetchModel({ dir, files = MODEL_FILES, fetchFn = fetch, writeFile = fsWriteFile }) {
  for (const { name, sha256 } of files) {
    const response = await fetchFn(`${MODEL_URL}${name}`);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== sha256) throw new Error(`${name}: sha256 ${actual} no coincide con ${sha256}`);
    await writeFile(`${dir}/${name}`, bytes);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = process.argv[2];
  if (!dir) throw new Error('Uso: node scripts/fetch-model.mjs <directorio-destino>');
  await mkdir(dir, { recursive: true });
  await fetchModel({ dir });
  console.log(`Modelo de BodyPix descargado en ${dir}`);
}
