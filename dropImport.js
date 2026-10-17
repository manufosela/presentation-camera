/**
 * Qué se ha soltado sobre la vista previa (CAM-TSK-0091): una carpeta
 * exportada ({ kind: 'directory', handle }), un fichero ({ kind: 'file', file })
 * o varios ({ kind: 'files', files }, para un deck de imágenes: CAM-TSK-0014).
 *
 * Los elementos del DataTransfer solo se pueden leer durante el evento drop:
 * todo se pide de forma síncrona y solo después se espera.
 */
export async function droppedEntry(dataTransfer) {
  const pending = [...(dataTransfer?.items ?? [])].filter(entry => entry.kind === 'file')
    .map(entry => ({ handle: entry.getAsFileSystemHandle?.(), file: entry.getAsFile() })); // Chrome: distingue carpetas
  const entries = await Promise.all(pending.map(async ({ handle, file }) => ({ handle: await handle, file })));
  const isDirectory = entry => entry.handle?.kind === 'directory';
  if (entries.length > 1) {
    // Una carpeta mezclada con ficheros no se puede importar entera: se rechaza en vez de perderla.
    return entries.some(isDirectory) ? null : { kind: 'files', files: entries.map(entry => entry.file).filter(Boolean) };
  }
  const [entry] = entries;
  if (!entry) return null;
  if (isDirectory(entry)) return { kind: 'directory', handle: entry.handle };
  return entry.file ? { kind: 'file', file: entry.file } : null;
}
