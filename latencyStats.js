/** Mediana y p95 (rango más cercano) de las idas y vueltas del mando, en ms (CAM-TSK-0167). */

const percentile = (sorted, p) => sorted[Math.ceil((p / 100) * sorted.length) - 1];

export function latencySummary(samples) {
  if (samples.length === 0) return null;
  const sorted = samples.toSorted((a, b) => a - b);
  return { count: sorted.length, median: Math.round(percentile(sorted, 50)), p95: Math.round(percentile(sorted, 95)) };
}
