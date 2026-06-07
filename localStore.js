/**
 * Almacenamiento local de presentaciones HTML en OPFS (Origin Private File
 * System). Persistente entre recargas y per-origin (accesible también desde la
 * ventana del panel). Cada presentación HTML autocontenida se guarda como un
 * fichero y se sirve como blob URL (text/html) para el iframe.
 *
 * Alcance v1 (C1): un único .html autocontenido. Los bundles con assets
 * relativos (carpeta/zip) se sirven vía Service Worker en CAM-TSK-0022.
 */

const DIR = 'local-html';

async function getDir() {
  if (!navigator.storage?.getDirectory) {
    throw new Error('Tu navegador no soporta almacenamiento local (OPFS).');
  }
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

function newId() {
  return crypto?.randomUUID?.() ?? `html-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Guarda un fichero HTML en OPFS y devuelve su id (= localRef del store).
 * Lanza si el fichero no es válido o si OPFS no está disponible (sin fallback
 * silencioso: el caller decide cómo avisar).
 */
export async function saveHtml(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('Fichero HTML no válido.');
  }
  const dir = await getDir();
  const id = newId();
  const handle = await dir.getFileHandle(`${id}.html`, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
  return id;
}

/**
 * Devuelve un blob URL (text/html) del HTML guardado, o null si no existe el
 * contenido (p.ej. localStorage conserva la referencia pero OPFS fue limpiado).
 */
export async function getHtmlBlobUrl(id) {
  if (typeof id !== 'string' || !id) return null;
  const dir = await getDir();
  let handle;
  try {
    handle = await dir.getFileHandle(`${id}.html`);
  } catch {
    return null;
  }
  const file = await handle.getFile();
  const blob = new Blob([await file.arrayBuffer()], { type: 'text/html' });
  return URL.createObjectURL(blob);
}

/** Borra el HTML guardado. Devuelve true si existía y se borró. */
export async function removeHtml(id) {
  if (typeof id !== 'string' || !id) return false;
  const dir = await getDir();
  try {
    await dir.removeEntry(`${id}.html`);
    return true;
  } catch {
    return false;
  }
}
