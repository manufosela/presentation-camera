/**
 * Detección de presencia para el modo recorte.
 *
 * Si BodyPix no detecta a nadie (mala luz, fondo parecido, el presentador se
 * aparta), la máscara sale vacía y el overlay queda transparente. Este módulo
 * decide cuándo considerar que no hay nadie, con un margen para no parpadear
 * ante fallos puntuales de la segmentación.
 */

/** Fracción (0..1) de píxeles marcados como persona en `segmentation.data`. */
export function personCoverage(data) {
  if (!data.length) return 0;
  let person = 0;
  for (const value of data) person += value;
  return person / data.length;
}

/**
 * Seguimiento de presencia: ausente tras `absentAfterMs` seguidos por debajo de
 * `minCoverage`; presente en cuanto vuelve a superarlo.
 */
export function createPresenceTracker({ minCoverage = 0.01, absentAfterMs = 1500 } = {}) {
  let present = true;
  let emptySince = null;
  return {
    isPresent: () => present,
    update(coverage, now) {
      if (coverage >= minCoverage) {
        emptySince = null;
        present = true;
      } else {
        emptySince ??= now;
        if (now - emptySince >= absentAfterMs) present = false;
      }
      return present;
    },
  };
}
