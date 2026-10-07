/**
 * Probar el micrófono antes de empezar (CAM-TSK-0125): se abre el elegido, se
 * mide su nivel en cada frame y al parar se suelta todo (pista y AudioContext),
 * para que no quede el micrófono encendido.
 */

/** Nivel 0..1 (RMS) de una muestra de forma de onda en bytes (128 = silencio). */
export function levelFromSamples(samples) {
  let sum = 0;
  for (const value of samples) {
    const centered = (value - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 1.5);
}

export function createMicTester({
  getUserMedia = constraints => navigator.mediaDevices.getUserMedia(constraints),
  createAudioContext = () => new AudioContext(),
  requestFrame = cb => requestAnimationFrame(cb),
  cancelFrame = id => cancelAnimationFrame(id),
  onLevel,
}) {
  let session = null; // { stream, context, frameId }
  let request = 0; // cada start/stop invalida lo que aún se esté abriendo

  function stop() {
    request += 1;
    if (!session) return;
    cancelFrame(session.frameId);
    session.stream.getTracks().forEach(track => track.stop());
    session.context.close();
    session = null;
  }

  async function start(deviceId) {
    stop();
    const ticket = request;
    const stream = await getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
    if (ticket !== request) { // se paró (o se pidió otro) mientras se abría: no dejarlo encendido
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    const context = createAudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    session = { stream, context, frameId: null };
    const measure = () => {
      if (!session) return;
      analyser.getByteTimeDomainData(samples);
      onLevel(levelFromSamples(samples));
      session.frameId = requestFrame(measure);
    };
    session.frameId = requestFrame(measure);
  }

  return { start, stop, isRunning: () => session !== null };
}
