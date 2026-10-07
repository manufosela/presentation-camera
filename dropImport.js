/**
 * Qué se ha soltado sobre la vista previa (CAM-TSK-0091): una carpeta
 * exportada ({ kind: 'directory', handle }) o un fichero ({ kind: 'file', file }).
 *
 * Los elementos del DataTransfer solo se pueden leer durante el evento drop:
 * todo se pide de forma síncrona y solo después se espera.
 */
export async function droppedEntry(dataTransfer) {
  const item = [...(dataTransfer?.items ?? [])].find(entry => entry.kind === 'file');
  if (!item) return null;
  const pendingHandle = item.getAsFileSystemHandle?.(); // Chrome: distingue carpetas
  const file = item.getAsFile();
  const handle = await pendingHandle;
  if (handle?.kind === 'directory') return { kind: 'directory', handle };
  return file ? { kind: 'file', file } : null;
}
