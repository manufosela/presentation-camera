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

const BUNDLES_DIR = 'local-bundles';

async function copyDir(src, dst, onRootEntry) {
  for await (const [name, handle] of src.entries()) {
    onRootEntry?.(name);
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      const fh = await dst.getFileHandle(name, { create: true });
      const writable = await fh.createWritable();
      await writable.write(file);
      await writable.close();
    } else if (handle.kind === 'directory') {
      const sub = await dst.getDirectoryHandle(name, { create: true });
      await copyDir(handle, sub);
    }
  }
}

/**
 * Copia un bundle HTML (carpeta con index.html + assets) a OPFS bajo
 * local-bundles/<id>/, replicando la estructura. Devuelve el id (= localRef).
 * Rechaza si no hay index.html en la raíz (sin fallback silencioso).
 */
export async function saveBundle(dirHandle) {
  if (!navigator.storage?.getDirectory) {
    throw new Error('Tu navegador no soporta almacenamiento local (OPFS).');
  }
  if (!dirHandle || typeof dirHandle.entries !== 'function') {
    throw new Error('Carpeta no válida.');
  }
  const root = await navigator.storage.getDirectory();
  const bundles = await root.getDirectoryHandle(BUNDLES_DIR, { create: true });
  const id = newId();
  const dest = await bundles.getDirectoryHandle(id, { create: true });
  let hasIndex = false;
  await copyDir(dirHandle, dest, name => { if (name === 'index.html') hasIndex = true; });
  if (!hasIndex) {
    try { await bundles.removeEntry(id, { recursive: true }); } catch { /* noop */ }
    throw new Error('La carpeta no contiene un index.html en su raíz.');
  }
  return id;
}
