/**
 * Grabar la pantalla con la burbuja de cámara (CAM-TSK-0165), como Loom: el
 * botón del setup abre la burbuja y desde ella se graba, pausa y para. La
 * burbuja se abre antes de pedir la cámara porque abrirla gasta el permiso del
 * clic, que dura poco; la cámara entra cuando llega. Parar (o cerrar la
 * burbuja) termina la grabación y vuelve a onslide para recortar y descargar.
 */

export function createScreenSession({ openBubble, requestCamera, createFlow, showStatus, focusApp, logger = console }) {
  let bubble = null;

  const stateOf = flow => {
    if (!flow.isRecording()) return 'idle';
    return flow.isPaused() ? 'paused' : 'recording';
  };
  const flow = createFlow(() => bubble?.setState(stateOf(flow)));

  function finish() {
    if (flow.isRecording()) flow.stop();
    bubble?.close();
    focusApp();
  }

  async function open() {
    if (bubble) return;
    try {
      bubble = await openBubble({
        onRecord: () => flow.start(),
        onPause: () => flow.togglePause(),
        onStop: finish,
        onClose: () => { // la cierra el usuario o finish()
          bubble = null;
          if (flow.isRecording()) flow.stop();
        },
      });
    } catch (error) {
      logger.error(error);
      showStatus(error.message, true);
      return;
    }
    const opened = bubble;
    try {
      const camera = await requestCamera();
      if (bubble === opened) opened.showCamera(camera);
      else for (const track of camera.getTracks()) track.stop(); // ya cerrada: no dejarla encendida
    } catch (error) { // sin cámara se puede grabar igual la pantalla
      logger.error(error);
      showStatus(error.message, true);
    }
  }

  return { open };
}
