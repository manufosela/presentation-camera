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
  review = async () => null, // diálogo de recorte: { startSec, endSec } o null = entera (CAM-TSK-0129)
  trim = null, // trimRecording (recordingTrim.js)
  discardSaved = async () => {}, // borra la copia en disco al descartar (CAM-TSK-0139)
}) {
  let controller = null;
  const isRecording = () => controller !== null;

  // Tras parar: se elige el recorte y se descargan el vídeo y sus capítulos.
  // Si el recorte falla se avisa y se descarga entera: nunca se pierde.
  async function save({ blob, type, durationMs, chapterSet }) {
    const filename = buildRecordingFilename(now(), extFromMime(type));
    let video = blob;
    let chapterRange;
    try {
      const range = await review({ blob, durationSec: durationMs / 1000 });
      if (range?.discard) { // confirmado dos veces en el diálogo: ni vídeo ni capítulos
        try {
          await discardSaved();
          showStatus(t('trim.discarded'), false);
        } catch (error) { // no se descarga igualmente; la copia se borrará al grabar otra
          logger.error(error);
          showStatus(t('trim.discardFailed'), true);
        }
        return;
      }
      if (range) {
        const trimmed = await trim(blob, range);
        video = trimmed.blob;
        chapterRange = { fromMs: trimmed.startSec * 1000, toMs: range.endSec * 1000 };
      }
    } catch (error) {
      logger.error(error);
      showStatus(t('trim.failed'), true);
    }
    download(video, filename);
    // Capítulos (CAM-TSK-0097): mismo nombre, .vtt; solo si el deck avisó de sus cambios.
    const vtt = chapterSet?.toVtt(chapterRange);
    if (vtt) download(new Blob([vtt], { type: 'text/vtt' }), filename.replace(/\.\w+$/, '.vtt'));
  }

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
          // Duración y capítulos se congelan ya: el rato en el diálogo no cuenta.
          const durationMs = controller?.elapsed() ?? 0;
          const chapterSet = chapters?.track.finish();
          controller = null;
          onChange();
          setChromeHidden(false); // al terminar, volver a mostrar los controles
          save({ blob, type, durationMs, chapterSet });
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
