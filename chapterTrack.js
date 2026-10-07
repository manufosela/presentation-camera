/**
 * Capítulos de la grabación por cambio de diapositiva (CAM-TSK-0097).
 *
 * Mientras se graba, cada diapositiva nueva que avisa el deck abre un capítulo;
 * al terminar se genera un WebVTT de capítulos (el formato estándar que leen
 * <track kind="chapters">, los editores y, como marcas de tiempo, YouTube). Si
 * el deck nunca avisó (Genially, Canva…), no hay capítulos.
 */

const pad = (value, size = 2) => String(value).padStart(size, '0');

function timestamp(ms) {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(Math.round(ms % 1000), 3)}`;
}

export function createChapterTrack({ now = () => Date.now() } = {}) {
  let startedAt = null;
  let marks = [];

  return {
    /** Empieza a grabar; `current` es la diapositiva a la vista, si se sabe. */
    start(current) {
      startedAt = now();
      marks = current ? [{ at: 0, label: current }] : [];
    },
    mark(label) {
      if (startedAt === null || marks.at(-1)?.label === label) return;
      marks.push({ at: now() - startedAt, label });
    },
    /**
     * Cierra los capítulos (null si no hubo ninguno). Su `toVtt` da el WebVTT con
     * un capítulo por tramo; con un rango (vídeo recortado, CAM-TSK-0127) quita
     * los de fuera, acorta los de los bordes y los desplaza al inicio del rango.
     */
    finish() {
      if (startedAt === null) return null;
      const end = now() - startedAt;
      startedAt = null;
      if (!marks.length) return null;
      const spans = marks.map((mark, index) => ({ ...mark, until: marks[index + 1]?.at ?? end }));
      return {
        toVtt({ fromMs = 0, toMs = end } = {}) {
          const cues = spans
            .map(span => ({ ...span, at: Math.max(span.at, fromMs) - fromMs, until: Math.min(span.until, toMs) - fromMs }))
            .filter(span => span.until > span.at)
            .map((span, index) => `${index + 1}\n${timestamp(span.at)} --> ${timestamp(span.until)}\n${span.label}\n`);
          return cues.length ? ['WEBVTT', '', ...cues].join('\n') : null;
        },
      };
    },
  };
}
