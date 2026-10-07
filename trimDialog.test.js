// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatClock, openTrimDialog } from './trimDialog.js';

function mount() {
  document.body.innerHTML = `
    <dialog id="trimDialog">
      <video class="trim-video"></video>
      <form method="dialog">
        <input type="range" id="trimStart"><output id="trimStartTime"></output>
        <input type="range" id="trimEnd"><output id="trimEndTime"></output>
        <button type="submit" value="full">entero</button>
        <button type="submit" value="trim">descargar</button>
      </form>
    </dialog>`;
  const dialog = document.getElementById('trimDialog');
  const $ = id => document.getElementById(id);
  return { dialog, video: dialog.querySelector('video'), start: $('trimStart'), end: $('trimEnd'), startTime: $('trimStartTime'), endTime: $('trimEndTime') };
}

const urls = { createUrl: vi.fn(() => 'blob:grabacion'), revokeUrl: vi.fn() };
const move = (input, value) => { input.value = String(value); input.dispatchEvent(new Event('input')); };
const closeWith = (dialog, value) => dialog.close(value);

beforeEach(() => vi.clearAllMocks());

describe('formatClock', () => {
  it('minutos:segundos, y horas solo si hacen falta', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(75.4)).toBe('1:15');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('openTrimDialog — elegir inicio y fin antes de descargar (CAM-TSK-0128)', () => {
  it('abre con la grabación en la vista previa y el rango entero', () => {
    const ui = mount();
    openTrimDialog({ dialog: ui.dialog, blob: new Blob(), durationSec: 90, ...urls });
    expect(ui.dialog.open).toBe(true);
    expect(ui.video.src).toBe('blob:grabacion');
    expect([ui.start.max, ui.end.max, ui.start.value, ui.end.value]).toEqual(['90', '90', '0', '90']);
    expect([ui.startTime.value, ui.endTime.value]).toEqual(['0:00', '1:30']);
  });

  it('mover inicio o fin lleva la vista previa ahí, y nunca se cruzan (1 s mínimo)', () => {
    const ui = mount();
    openTrimDialog({ dialog: ui.dialog, blob: new Blob(), durationSec: 90, ...urls });
    move(ui.start, 12.5);
    expect(ui.video.currentTime).toBe(12.5);
    expect(ui.startTime.value).toBe('0:12');
    move(ui.end, 5);
    expect(ui.end.value).toBe('13.5');
    move(ui.start, 80);
    expect(ui.start.value).toBe('12.5');
  });

  it('con una grabación de menos de 2 s el rango sigue dentro del vídeo y en orden', () => {
    const ui = mount();
    openTrimDialog({ dialog: ui.dialog, blob: new Blob(), durationSec: 0.5, ...urls });
    move(ui.start, 0.4);
    move(ui.end, 0);
    expect([Number(ui.start.value), Number(ui.end.value)]).toEqual([0.25, 0.5]);
  });

  it('descargar con el rango cambiado devuelve inicio y fin, y suelta la vista previa', async () => {
    const ui = mount();
    const choice = openTrimDialog({ dialog: ui.dialog, blob: new Blob(), durationSec: 90, ...urls });
    move(ui.start, 3);
    move(ui.end, 80);
    closeWith(ui.dialog, 'trim');
    expect(await choice).toEqual({ startSec: 3, endSec: 80 });
    expect(urls.revokeUrl).toHaveBeenCalledWith('blob:grabacion');
    expect(ui.video.hasAttribute('src')).toBe(false);
  });

  it('sin tocar nada, con «entero» o cerrando con Esc, se descarga entero (null)', async () => {
    for (const value of ['trim', 'full', '']) {
      const ui = mount();
      const choice = openTrimDialog({ dialog: ui.dialog, blob: new Blob(), durationSec: 90, ...urls });
      if (value === 'full') move(ui.start, 10);
      closeWith(ui.dialog, value);
      expect(await choice).toBeNull();
    }
  });
});
