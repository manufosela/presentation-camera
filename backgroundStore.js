/**
 * Imágenes de fondo para el recorte, guardadas en el navegador (OPFS,
 * carpeta backgrounds/) para elegirlas sin volver a subirlas (CAM-TSK-0058).
 *
 * Cada imagen se guarda como `<ms>-<uuid>~<nombre>.<ext>`: el nombre del
 * fichero es su id, empieza por el instante de subida (con ancho fijo, para
 * ordenar; OPFS no garantiza el orden) y conserva el nombre original.
 */

const DIR = 'backgrounds';
export const MAX_BACKGROUND_BYTES = 15 * 1024 * 1024;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
// ms - uuid ~ nombre codificado . extensión; sin barras: no sale de la carpeta.
const ID_PATTERN = /^\d{13}-[\da-f-]{36}~[^/\\]*\.(?:png|jpg|webp)$/;

const defaultRoot = () => {
  if (!navigator.storage?.getDirectory) throw new Error('Tu navegador no soporta almacenamiento local (OPFS).');
  return navigator.storage.getDirectory();
};

async function getDir(getRoot, create) {
  const root = await getRoot();
  return root.getDirectoryHandle(DIR, { create });
}

// Solo «no existe» tiene respuesta propia (vacío/null/false); cualquier otro
// fallo del almacenamiento (permiso, cuota…) se propaga: no se disfraza.
function whenMissing(error, value) {
  if (error?.name === 'NotFoundError') return value;
  throw error;
}

const nameOf = id => decodeURIComponent(id.slice(id.indexOf('~') + 1, id.lastIndexOf('.')));

/** Guarda la imagen y devuelve { id, name }. Lanza si no es válida. */
export async function saveBackground(file, getRoot = defaultRoot) {
  const ext = EXTENSIONS[file?.type];
  if (!ext) throw new Error('El fondo tiene que ser una imagen PNG, JPEG o WebP.');
  if (file.size > MAX_BACKGROUND_BYTES) throw new Error('La imagen de fondo no puede pasar de 15 MB.');
  const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 60);
  const id = `${String(Date.now()).padStart(13, '0')}-${crypto.randomUUID()}~${encodeURIComponent(baseName)}.${ext}`;
  const dir = await getDir(getRoot, true);
  const writable = await (await dir.getFileHandle(id, { create: true })).createWritable();
  await writable.write(file);
  await writable.close();
  return { id, name: baseName };
}

/** Fondos guardados, en orden de subida: [{ id, name, file }]. */
export async function listBackgrounds(getRoot = defaultRoot) {
  let dir;
  try {
    dir = await getDir(getRoot, false);
  } catch (error) {
    return whenMissing(error, []); // aún no se ha guardado ninguno
  }
  const list = [];
  for await (const [id, handle] of dir.entries()) {
    if (handle.kind === 'file' && ID_PATTERN.test(id)) list.push({ id, name: nameOf(id), file: await handle.getFile() });
  }
  return list.toSorted((a, b) => a.id.localeCompare(b.id)); // por el instante del prefijo
}

/** File del fondo, o null si no existe. */
export async function readBackground(id, getRoot = defaultRoot) {
  if (!ID_PATTERN.test(id)) return null;
  try {
    return await (await (await getDir(getRoot, false)).getFileHandle(id)).getFile();
  } catch (error) {
    return whenMissing(error, null);
  }
}

/** Borra el fondo; true si existía. */
export async function removeBackground(id, getRoot = defaultRoot) {
  if (!ID_PATTERN.test(id)) return false;
  try {
    await (await getDir(getRoot, false)).removeEntry(id);
    return true;
  } catch (error) {
    return whenMissing(error, false);
  }
}
