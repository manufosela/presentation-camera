// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderDeviceSelect } from './deviceSelect.js';

const devices = [
  { kind: 'videoinput', deviceId: 'cam-1', label: 'Webcam HD' },
  { kind: 'audioinput', deviceId: 'mic-1', label: 'Micro USB' },
  { kind: 'audioinput', deviceId: 'mic-2', label: '' }, // sin permiso aún: sin nombre
  { kind: 'audiooutput', deviceId: 'out-1', label: 'Altavoces' },
];
const labels = { autoLabel: 'Automático', numberedLabel: n => `Micrófono ${n}` };

describe('renderDeviceSelect — elegir cámara o micrófono (CAM-TSK-0101)', () => {
  it('pone «Automático» y los dispositivos de ese tipo, con número si no tienen nombre', () => {
    const select = document.createElement('select');
    const count = renderDeviceSelect(select, devices, { kind: 'audioinput', selectedId: null, ...labels });
    expect(count).toBe(2);
    expect([...select.options].map(o => [o.value, o.textContent])).toEqual([
      ['', 'Automático'], ['mic-1', 'Micro USB'], ['mic-2', 'Micrófono 2'],
    ]);
    expect(select.value).toBe('');
  });

  it('marca el guardado si sigue existiendo; si no, Automático', () => {
    const select = document.createElement('select');
    renderDeviceSelect(select, devices, { kind: 'audioinput', selectedId: 'mic-2', ...labels });
    expect(select.value).toBe('mic-2');
    renderDeviceSelect(select, devices, { kind: 'audioinput', selectedId: 'ya-no-está', ...labels });
    expect(select.value).toBe('');
  });
});
