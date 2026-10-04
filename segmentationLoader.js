/**
 * Carga diferida de TensorFlow y BodyPix (CAM-TSK-0029).
 *
 * Son ~1,7 MB que solo necesita el estilo recorte: ya no bloquean la pantalla
 * de setup. Se inyectan como <script> clásicos (son bundles UMD) la primera vez
 * que hacen falta, y TensorFlow siempre antes que BodyPix.
 */

const TF_SRC = 'vendor/tf.min.js';
const BODY_PIX_SRC = 'vendor/body-pix.min.js';

const pending = new Map();

/** Inyecta `src` una sola vez; si falla, se retira para poder reintentar. */
export function loadScriptOnce(src, doc = document) {
  if (pending.has(src)) return pending.get(src);
  const script = doc.createElement('script');
  script.src = src;
  const loading = new Promise((resolve, reject) => {
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => {
      pending.delete(src);
      script.remove();
      reject(new Error(`No se pudo cargar ${src}`));
    }, { once: true });
  });
  pending.set(src, loading);
  doc.head.append(script);
  return loading;
}

/** Carga TensorFlow y BodyPix y devuelve la API de BodyPix. */
export async function loadBodyPixLibrary(win = window, load = loadScriptOnce) {
  await load(TF_SRC);
  await load(BODY_PIX_SRC);
  // El bundle UMD de body-pix 2.2.x expone la API como window["body-pix"].
  const api = win.bodyPix ?? win['body-pix'];
  if (!api) throw new Error('BodyPix no quedó disponible tras cargar su script.');
  return api;
}
