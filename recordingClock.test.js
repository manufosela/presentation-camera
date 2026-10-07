import { describe, expect, it } from 'vitest';
import { createRecordingClock } from './recordingClock.js';

function clock() {
  let time = 0;
  const recording = createRecordingClock(() => time);
  return { recording, at: ms => { time = ms; } };
}

describe('recordingClock — tiempo grabado sin las pausas (CAM-TSK-0098)', () => {
  it('cuenta desde que empieza', () => {
    const { recording, at } = clock();
    at(1000);
    recording.start();
    at(4000);
    expect(recording.elapsed()).toBe(3000);
  });

  it('las pausas no cuentan, aunque se repitan', () => {
    const { recording, at } = clock();
    recording.start();
    at(2000);
    recording.pause();
    at(9000);
    expect(recording.elapsed()).toBe(2000); // parado durante la pausa
    recording.resume();
    at(10_000);
    recording.pause();
    at(20_000);
    recording.resume();
    at(21_500);
    expect(recording.elapsed()).toBe(4500);
    expect(recording.isPaused()).toBe(false);
  });

  it('pausar dos veces o reanudar sin pausa no descuadra', () => {
    const { recording, at } = clock();
    recording.start();
    recording.resume();
    at(1000);
    recording.pause();
    recording.pause();
    expect(recording.isPaused()).toBe(true);
    at(5000);
    recording.resume();
    at(6000);
    expect(recording.elapsed()).toBe(2000);
  });
});
