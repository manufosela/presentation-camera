/**
 * Orientación del mando (CAM-BUG-0028). Si onslide está instalada como app, el
 * enlace del QR se abre dentro de ella y hereda la orientación horizontal del
 * manifiesto; el mando se usa a una mano, en vertical. El bloqueo solo lo
 * conceden la app instalada o la pantalla completa: en una pestaña normal se
 * rechaza y la página ya sigue al móvil, así que no hay nada que corregir.
 */

/** Bloquea la pantalla en vertical; devuelve si el navegador lo ha concedido. */
export async function lockPortrait(orientation = globalThis.screen?.orientation) {
  if (typeof orientation?.lock !== 'function') return false;
  try {
    await orientation.lock('portrait');
    return true;
  } catch {
    return false;
  }
}
