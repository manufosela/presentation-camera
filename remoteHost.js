/**
 * Mando desde el móvil, lado escritorio (CAM-TSK-0167): abre la sesión la
 * primera vez que se pide, enseña el QR y el enlace, refleja si el móvil está
 * conectado y pasa cada comando al deck. La sesión vive mientras la página.
 */

import { hostRemote, loadRemoteDatabase } from './remoteChannel.js';
import { createSessionId, remoteUrl } from './remoteSession.js';

const QR_CELL_PX = 6;
const QR_MARGIN_CELLS = 2;
// Sin red, RTDB deja la escritura en cola para siempre: pasado este tiempo se da por fallida.
const OPEN_TIMEOUT_MS = 15_000;

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`sin respuesta en ${ms} ms`)), ms)),
]);

export function createRemoteHost({
  qrImage, urlLink, status, pageUrl, onCommand, onPhoneLost = () => {}, t,
  newSessionId = createSessionId,
  // URL calculada, como pdf.js: el fichero lo descarga fetch-assets y no está en git.
  loadQr = () => import(new URL('vendor-dl/qrcode/qrcode.mjs', document.baseURI).href),
  loadRtdb = loadRemoteDatabase,
}) {
  let opening = null;
  let session = null;
  let phoneSeen = false;
  const setStatus = key => { status.textContent = t(key); };

  const onPhone = online => {
    if (online) {
      phoneSeen = true;
      setStatus('remoteHost.phoneOn');
    } else if (phoneSeen) {
      setStatus('remoteHost.phoneOff');
      onPhoneLost();
    }
  };

  async function start() {
    const sessionId = newSessionId();
    const url = remoteUrl(pageUrl, sessionId);
    setStatus('remoteHost.opening');
    const connecting = (async () => {
      const [{ qrcode }, rtdb] = await Promise.all([loadQr(), loadRtdb()]);
      return { qrcode, hosted: await hostRemote({ rtdb, sessionId, onCommand, onPhone }) };
    })();
    try {
      const { qrcode, hosted } = await withTimeout(connecting, OPEN_TIMEOUT_MS);
      session = hosted;
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      qrImage.src = qr.createDataURL(QR_CELL_PX, QR_MARGIN_CELLS);
      urlLink.href = url;
      urlLink.textContent = url;
      if (!phoneSeen) setStatus('remoteHost.waiting');
    } catch (error) {
      console.error('[remote] no se pudo abrir la sesión del mando', error);
      setStatus('remoteHost.failed');
      // Si la sesión llega tarde se cierra: nadie debe mandar en el deck sin que se vea.
      // Un nuevo intento crea otra sesión con otro id, así que no choca con ella.
      connecting.then(({ hosted }) => hosted.close(), () => {});
      opening = null;
    }
  }

  return {
    open: () => (opening ??= start()),
    close: () => session?.close(),
  };
}
