import { describe, expect, it } from 'vitest';
import { latencySummary } from './latencyStats.js';

describe('resumen de latencia del mando (CAM-TSK-0167)', () => {
  it('sin muestras no hay resumen', () => {
    expect(latencySummary([])).toBeNull();
  });

  it('mediana y p95 por rango más cercano, redondeados a ms', () => {
    const samples = Array.from({ length: 20 }, (_, i) => (i + 1) * 10.4);
    expect(latencySummary(samples)).toEqual({ count: 20, median: 104, p95: 198 });
  });

  it('no depende del orden de llegada', () => {
    expect(latencySummary([300, 100, 200])).toEqual({ count: 3, median: 200, p95: 300 });
  });
});
