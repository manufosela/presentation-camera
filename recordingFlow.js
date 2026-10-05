/**
 * Flujo de grabación de la sesión (CAM-TSK-0046, paso 6 de trocear precam.js).
 *
 * Empezar oculta los controles de la app para que no salgan en el vídeo y no
 * deja avisos encima; parar descarga el fichero y vuelve a mostrarlos. Si el
 * usuario cancela el selector de captura, la presentación sigue sin grabar.
 * Las dependencias (grabación real, descarga, DOM) se inyectan para testearlo.
 */

import { buildRecordingFilename, extFromMime } from './recorder.js';
import { t } from './i18n.js';

export function createRecordingFlow({
  startRecording,
  download,
  now = () => new Date(),
  setChromeHidden,
  showStatus,
  onChange,
  logger = console,
}) {
  let controller = null;
  const isRecording = () => controller !== null;

  async function start() {
    if (isRecording()) return;
    try {
      controller = await startRecording({
        withMic: true,
        withSystemAudio: true,
        onStop: (blob, type) => {
          download(blob, buildRecordingFilename(now(), extFromMime(type)));
          controller = null;
          onChange();
          setChromeHidden(false); // al terminar, volver a mostrar los controles
        },
        onError: error => {
          logger.error(error);
          showStatus(error.message || t('error.recording'), true);
        },
      });
      onChange();
      setChromeHidden(true); // ocultar controles para que no salgan en la grabación
      showStatus(''); // ningún aviso encima de lo que se graba
    } catch (error) {
      // El usuario canceló el selector de captura u otro fallo: seguimos sin grabar.
      logger.warn('Grabación no iniciada', error);
      controller = null;
      onChange();
      showStatus(t('recording.notStarted'), false);
    }
  }

  function stop() {
    controller?.stop(); // dispara onStop → descarga
  }

  return {
    start,
    stop,
    toggle: () => (isRecording() ? stop() : start()),
    isRecording,
  };
}
