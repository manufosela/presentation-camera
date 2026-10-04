// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { notesAt, parseDeckNotes } from './deckNotes.js';

const deck = slides => `<!doctype html><html><body><div class="reveal"><div class="slides">${slides}</div></div></body></html>`;

describe('parseDeckNotes — notas del ponente de un deck reveal.js', () => {
  it('slides horizontales con aside.notes', () => {
    const notes = parseDeckNotes(deck(`
      <section><h1>Uno</h1><aside class="notes">Nota uno</aside></section>
      <section><h1>Dos</h1><aside class="notes">Nota dos</aside></section>`));
    expect(notes).toEqual([['Nota uno'], ['Nota dos']]);
  });

  it('slides verticales anidadas: [h][v]', () => {
    const notes = parseDeckNotes(deck(`
      <section><h1>Uno</h1><aside class="notes">h0</aside></section>
      <section>
        <section><aside class="notes">h1v0</aside></section>
        <section><aside class="notes">h1v1</aside></section>
      </section>`));
    expect(notes).toEqual([['h0'], ['h1v0', 'h1v1']]);
  });

  it('data-notes en la sección también cuenta', () => {
    expect(parseDeckNotes(deck('<section data-notes="Desde atributo"><h1>X</h1></section>'))).toEqual([['Desde atributo']]);
  });

  it('data-notes vacío también tiene prioridad (como reveal.js: cuenta la presencia del atributo)', () => {
    expect(parseDeckNotes(deck('<section data-notes=""><aside class="notes">fallback</aside></section>'))).toEqual([['']]);
  });

  it('slide sin notas → cadena vacía', () => {
    expect(parseDeckNotes(deck('<section><h1>Sin notas</h1></section>'))).toEqual([['']]);
  });

  it('las notas son texto plano: el HTML del deck no se ejecuta ni se conserva', () => {
    const notes = parseDeckNotes(deck(`<section><aside class="notes"><b>Ojo</b><img src=x onerror="alert(1)"> con <i>esto</i></aside></section>`));
    expect(notes).toEqual([['Ojo con esto']]);
  });

  it('conserva los saltos de párrafo y limpia espacios sobrantes', () => {
    const notes = parseDeckNotes(deck(`<section><aside class="notes">
        <p>Primera   idea</p>
        <p>Segunda idea</p>
      </aside></section>`));
    expect(notes).toEqual([['Primera idea\nSegunda idea']]);
  });

  it('HTML sin estructura reveal.js → sin notas', () => {
    expect(parseDeckNotes('<html><body><p>No es un deck</p></body></html>')).toEqual([]);
  });
});

describe('notesAt — nota de una slide concreta', () => {
  const notes = [['h0'], ['h1v0', 'h1v1']];

  it('devuelve la nota de [h][v]', () => {
    expect(notesAt(notes, 1, 1)).toBe('h1v1');
  });

  it('fuera de rango → cadena vacía', () => {
    expect(notesAt(notes, 5, 0)).toBe('');
    expect(notesAt(notes, 0, 3)).toBe('');
  });
});
