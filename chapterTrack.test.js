import { describe, expect, it } from 'vitest';
import { createChapterTrack } from './chapterTrack.js';

function track() {
  let time = 0;
  const chapters = createChapterTrack({ now: () => time });
  return { chapters, at: ms => { time = ms; } };
}

describe('chapterTrack — capítulos por cambio de diapositiva (CAM-TSK-0097)', () => {
  it('cada cambio abre un capítulo y al terminar sale un WebVTT con todos', () => {
    const { chapters, at } = track();
    at(10_000);
    chapters.start('Diapositiva 1'); // la que se ve al empezar a grabar
    at(25_500);
    chapters.mark('Diapositiva 2');
    at(10_000 + 3_725_250);
    chapters.mark('Diapositiva 3');
    at(10_000 + 3_800_000);
    expect(chapters.finish().toVtt()).toBe([
      'WEBVTT',
      '',
      '1',
      '00:00:00.000 --> 00:00:15.500',
      'Diapositiva 1',
      '',
      '2',
      '00:00:15.500 --> 01:02:05.250',
      'Diapositiva 2',
      '',
      '3',
      '01:02:05.250 --> 01:03:20.000',
      'Diapositiva 3',
      '',
    ].join('\n'));
  });

  it('la misma diapositiva repetida no abre otro capítulo', () => {
    const { chapters, at } = track();
    chapters.start('Diapositiva 1');
    at(1000);
    chapters.mark('Diapositiva 1');
    at(2000);
    expect(chapters.finish().toVtt().match(/-->/g)).toHaveLength(1);
  });

  it('si al empezar no se sabe la diapositiva, el primer capítulo empieza con el primer aviso', () => {
    const { chapters, at } = track();
    chapters.start(null);
    at(4000);
    chapters.mark('Diapositiva 2');
    at(9000);
    expect(chapters.finish().toVtt()).toContain('00:00:04.000 --> 00:00:09.000\nDiapositiva 2');
  });

  it('al recortar el vídeo, los capítulos se recortan y desplazan igual (CAM-TSK-0127)', () => {
    const { chapters, at } = track();
    chapters.start('Diapositiva 1');
    at(3000);
    chapters.mark('Diapositiva 2');
    at(8000);
    chapters.mark('Diapositiva 3');
    at(12_000);
    const done = chapters.finish();
    at(99_000); // el tiempo que pase eligiendo el recorte no cuenta
    expect(done.toVtt({ fromMs: 2000, toMs: 9000 })).toBe([
      'WEBVTT', '',
      '1', '00:00:00.000 --> 00:00:01.000', 'Diapositiva 1', '',
      '2', '00:00:01.000 --> 00:00:06.000', 'Diapositiva 2', '',
      '3', '00:00:06.000 --> 00:00:07.000', 'Diapositiva 3', '',
    ].join('\n'));
    expect(done.toVtt({ fromMs: 4000, toMs: 7000 })).toBe('WEBVTT\n\n1\n00:00:00.000 --> 00:00:03.000\nDiapositiva 2\n');
    expect(done.toVtt({ fromMs: 12_000, toMs: 15_000 })).toBeNull(); // ningún capítulo en el rango
  });

  it('una presentación que no avisa de sus cambios no genera capítulos', () => {
    const { chapters, at } = track();
    chapters.start(null);
    at(60_000);
    expect(chapters.finish()).toBeNull();
  });

  it('las marcas fuera de una grabación se ignoran', () => {
    const { chapters } = track();
    chapters.mark('Diapositiva 4');
    chapters.start(null);
    expect(chapters.finish()).toBeNull();
  });
});
