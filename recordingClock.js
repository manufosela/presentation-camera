/**
 * Reloj de la grabación sin las pausas (CAM-TSK-0098): da la duración del
 * vídeo y el instante de cada capítulo, que no deben contar el tiempo pausado.
 */
export function createRecordingClock(now = () => Date.now()) {
  let startedAt = 0;
  let pausedAt = null;
  let pausedTotal = 0;

  return {
    start() {
      startedAt = now();
      pausedAt = null;
      pausedTotal = 0;
    },
    pause() {
      pausedAt ??= now();
    },
    resume() {
      if (pausedAt === null) return;
      pausedTotal += now() - pausedAt;
      pausedAt = null;
    },
    isPaused: () => pausedAt !== null,
    /** Milisegundos grabados (sin pausas) desde start(). */
    elapsed: () => (pausedAt ?? now()) - startedAt - pausedTotal,
  };
}
