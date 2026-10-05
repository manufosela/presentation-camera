// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderBackgroundPicker } from './backgroundPicker.js';

const backgrounds = [
  { id: 'a.png', name: 'Playa', url: 'blob:a' },
  { id: 'b.jpg', name: 'Oficina', url: 'blob:b' },
];

let container;
let handlers;
beforeEach(() => {
  document.body.innerHTML = '<div id="picker"></div>';
  container = document.getElementById('picker');
  handlers = { onSelect: vi.fn(), onRemove: vi.fn(), onUpload: vi.fn() };
});

const render = selectedId => renderBackgroundPicker(container, { backgrounds, selectedId, ...handlers });
const choices = () => [...container.querySelectorAll('.bg-choice')];

describe('renderBackgroundPicker — galería de fondos', () => {
  it('muestra Ninguno, cada fondo con su miniatura y el botón de subir', () => {
    render(null);
    expect(choices().map(c => c.getAttribute('aria-label'))).toEqual(['Sin fondo', 'Fondo Playa', 'Fondo Oficina']);
    expect(container.querySelector('img[alt="Playa"]').getAttribute('src')).toBe('blob:a');
    expect(container.querySelector('.bg-upload').textContent).toContain('Subir');
  });

  it('marca el elegido (Ninguno si no hay)', () => {
    render(null);
    expect(choices().map(c => c.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    render('b.jpg');
    expect(choices().map(c => c.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
  });

  it('elegir avisa con el id; Ninguno con null', () => {
    render(null);
    choices()[2].click();
    choices()[0].click();
    expect(handlers.onSelect.mock.calls).toEqual([['b.jpg'], [null]]);
  });

  it('borrar avisa con el id, sin elegirlo', () => {
    render(null);
    const remove = container.querySelector('[aria-label="Borrar fondo Playa"]');
    remove.click();
    expect(handlers.onRemove).toHaveBeenCalledWith('a.png');
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it('subir avisa a la app', () => {
    render(null);
    container.querySelector('.bg-upload').click();
    expect(handlers.onUpload).toHaveBeenCalledTimes(1);
  });

  it('volver a pintar sustituye la galería anterior', () => {
    render(null);
    render(null);
    expect(choices()).toHaveLength(3);
  });

  it('todos son botones (accesibles por teclado)', () => {
    render(null);
    expect([...container.querySelectorAll('.bg-choice, .bg-remove, .bg-upload')].every(b => b.tagName === 'BUTTON' && b.type === 'button')).toBe(true);
  });
});
