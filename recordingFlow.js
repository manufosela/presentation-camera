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
  chapters = null, // { track: chapterTrack, current: () => diapositiva a la vista o null }
  countdown = async () => {}, // 3, 2, 1 antes de grabar (CAM-TSK-0099)
  getMicId = () => null, // micrófono elegido en el setup (CAM-TSK-0101)
}) {
  let controller = null;
  const isRecording = () => controller !== null;

  async function start() {
    if (isRecording()) return;
    let chromeHiddenByStart = false;
    try {
      controller = await startRecording({
        withMic: true,
        micDeviceId: getMicId(),
        withSystemAudio: true,
        // Aceptada la captura: fuera controles y avisos, cuenta atrás y a grabar.
        beforeStart: async () => {
          chromeHiddenByStart = true;
          setChromeHidden(true);
          showStatus('');
          await countdown();
        },
        onStop: (blob, type) => {
          const filename = buildRecordingFilename(now(), extFromMime(type));
          download(blob, filename);
          // Capítulos (CAM-TSK-0097): mismo nombre, .vtt; solo si el deck avisó de sus cambios.
          const vtt = chapters?.track.finish();
          if (vtt) download(new Blob([vtt], { type: 'text/vtt' }), filename.replace(/\.\w+$/, '.vtt'));
          controller = null;
          onChange();
          setChromeHidden(false); // al terminar, volver a mostrar los controles
        },
        onError: error => {
          logger.error(error);
          showStatus(error.message || t('error.recording'), true);
        },
      });
      chapters?.track.start(chapters.current());
      onChange(); // controles y avisos ya se ocultaron en beforeStart
    } catch (error) {
      // El usuario canceló el selector de captura u otro fallo: seguimos sin grabar.
      logger.warn('Grabación no iniciada', error);
      controller = null;
      if (chromeHiddenByStart) setChromeHidden(false); // falló tras la cuenta atrás
      onChange();
      showStatus(t('recording.notStarted'), false);
    }
  }

  function stop() {
    controller?.stop(); // dispara onStop → descarga
  }

  const isPaused = () => controller?.paused ?? false;

  /** Pausa o reanuda (CAM-TSK-0098); false si no hay grabación en curso. */
  function togglePause() {
    if (!isRecording()) return false;
    if (isPaused()) controller.resume();
    else controller.pause();
    onChange();
    return true;
  }

  return {
    start,
    stop,
    toggle: () => (isRecording() ? stop() : start()),
    togglePause,
    isRecording,
    isPaused,
    /** Milisegundos grabados, sin pausas (capítulos). */
    elapsed: () => controller?.elapsed() ?? 0,
  };
}
