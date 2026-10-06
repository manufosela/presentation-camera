/**
 * Descarga los recursos grandes que la app sirve desde su propio sitio pero
 * que no se versionan en git (CAM-TSK-0039, CAM-TSK-0013):
 *   - el modelo de BodyPix del recorte (2,6 MB) en models/bodypix/;
 *   - pdf.js para convertir PDFs (1,7 MB) en vendor-dl/pdfjs/.
 * Lo ejecuta el workflow de Pages al publicar y, en local, `npm run
 * fetch-assets`. Cada fichero se comprueba contra su sha256 fijado aquí: si
 * el origen cambia o la descarga se altera, falla en vez de publicar otra cosa.
 *
 * Uso: node scripts/fetch-assets.js <raíz-del-sitio>
 */

import { createHash } from 'node:crypto';
import { mkdir as fsMkdir, writeFile as fsWriteFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const ASSETS = [
  {
    // MobileNetV1, multiplier 0.75, stride 16, quantBytes 2 (lo que pide precam.js).
    name: 'bodypix',
    url: 'https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/mobilenet/quant2/075/',
    dir: 'models/bodypix',
    files: [
      { name: 'model-stride16.json', sha256: '7c9b3bd68f86004b75e739255b9b823c4d8f409fabe6dd753b76c0fdd90a357e' },
      { name: 'group1-shard1of1.bin', sha256: 'e215c9546b9db0e1e06c23c759ed48ccaf2aad68c656d0130b5757bc0479ac77' },
    ],
  },
  {
    name: 'pdfjs',
    url: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/',
    dir: 'vendor-dl/pdfjs',
    files: [
      { name: 'pdf.min.mjs', sha256: '57456c8e0c81e46be31174b499ef77f2b9f5ee46d04412ba627320a36755d4c2' },
      { name: 'pdf.worker.min.mjs', sha256: '9536359f1b8367850d485731ca1d5e45c159a7b7a0912325e539937aa21ceb18' },
    ],
  },
];

export async function fetchAsset({ asset, root, fetchFn = fetch, writeFile = fsWriteFile, mkdir = fsMkdir }) {
  const dir = `${root}/${asset.dir}`;
  await mkdir(dir, { recursive: true });
  for (const { name, sha256 } of asset.files) {
    const response = await fetchFn(`${asset.url}${name}`);
    if (!response.ok) throw new Error(`${asset.name}/${name}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== sha256) throw new Error(`${asset.name}/${name}: sha256 ${actual} no coincide con ${sha256}`);
    await writeFile(`${dir}/${name}`, bytes);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = process.argv[2];
  if (!root) throw new Error('Uso: node scripts/fetch-assets.js <raíz-del-sitio>');
  for (const asset of ASSETS) {
    await fetchAsset({ asset, root });
    console.log(`${asset.name} descargado en ${root}/${asset.dir}`);
  }
}
