import { describe, expect, it } from 'vitest';
import { createPresenceTracker, personCoverage } from './presence.js';

describe('personCoverage — fracción de píxeles de persona en la segmentación', () => {
  it('cuenta los 1 sobre el total', () => {
    expect(personCoverage(Uint8Array.from([0, 1, 1, 0]))).toBe(0.5);
  });

  it('máscara vacía → 0', () => {
    expect(personCoverage(new Uint8Array(16))).toBe(0);
  });

  it('sin datos → 0', () => {
    expect(personCoverage(new Uint8Array(0))).toBe(0);
  });
});

describe('createPresenceTracker — hay alguien delante de la cámara', () => {
  it('empieza presente (no avisa antes de la primera segmentación)', () => {
    expect(createPresenceTracker().isPresent()).toBe(true);
  });

  it('un hueco breve no cambia el estado (evita parpadeos)', () => {
    const tracker = createPresenceTracker({ minCoverage: 0.01, absentAfterMs: 1500 });
    tracker.update(0, 1000);
    expect(tracker.update(0, 2000)).toBe(true);
  });

  it('sin persona durante absentAfterMs → ausente', () => {
    const tracker = createPresenceTracker({ minCoverage: 0.01, absentAfterMs: 1500 });
    tracker.update(0, 1000);
    expect(tracker.update(0, 2500)).toBe(false);
  });

  it('vuelve a presente en cuanto se detecta persona', () => {
    const tracker = createPresenceTracker({ minCoverage: 0.01, absentAfterMs: 1500 });
    tracker.update(0, 1000);
    tracker.update(0, 3000);
    expect(tracker.update(0.2, 3050)).toBe(true);
  });

  it('una detección intermedia reinicia la cuenta de ausencia', () => {
    const tracker = createPresenceTracker({ minCoverage: 0.01, absentAfterMs: 1500 });
    tracker.update(0, 1000);
    tracker.update(0.3, 2000);
    tracker.update(0, 2100);
    expect(tracker.update(0, 3000)).toBe(true);
  });
});
