/**
 * Notas del ponente de un deck reveal.js leídas del HTML que la app ya tiene
 * guardado (sources locales). Permiten mostrar las notas en el panel de control
 * sin depender de la ventana de notas de reveal.js, que no funciona cuando el
 * deck se sirve como blob (CAM-BUG-0013).
 *
 * El HTML se analiza con DOMParser (documento inerte: no ejecuta scripts ni
 * carga recursos) y las notas se devuelven como texto plano.
 */

const BLOCK_ELEMENTS = 'p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre, tr';

// Texto plano de un nodo: un salto por bloque o <br>, espacios colapsados.
function plainText(node) {
  const clone = node.cloneNode(true);
  for (const br of clone.querySelectorAll('br')) br.replaceWith('\n');
  for (const block of clone.querySelectorAll(BLOCK_ELEMENTS)) block.append('\n');
  return clone.textContent
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

// Igual que reveal.js: si existe data-notes (aunque esté vacío) manda sobre aside.notes.
function notesOf(section) {
  const attribute = section.dataset.notes;
  if (attribute !== undefined) return attribute.trim();
  const aside = section.querySelector('aside.notes');
  return aside ? plainText(aside) : '';
}

/** Matriz [h][v] con las notas de cada slide (cadena vacía si no tiene). */
export function parseDeckNotes(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const slides = doc.querySelector('.reveal .slides');
  if (!slides) return [];
  return [...slides.children]
    .filter(el => el.tagName === 'SECTION')
    .map(horizontal => {
      const vertical = [...horizontal.children].filter(el => el.tagName === 'SECTION');
      return vertical.length ? vertical.map(notesOf) : [notesOf(horizontal)];
    });
}

/**
 * Lo que muestra el panel a partir del mensaje notes:update de la ventana
 * principal (o null si aún no ha llegado ninguno).
 */
export function notesView(update) {
  if (!update) return { position: '', text: 'Las notas aparecerán aquí al empezar la presentación.', empty: true };
  if (!update.local) {
    return {
      position: '',
      text: 'Presentación publicada: pulsa S en la ventana principal para abrir las notas de reveal.js.',
      empty: true,
    };
  }
  const vertical = update.v > 0 ? `.${update.v + 1}` : '';
  const position = `Slide ${update.h + 1}${vertical}`;
  return update.text
    ? { position, text: update.text, empty: false }
    : { position, text: 'Esta slide no tiene notas.', empty: true };
}

/** Nota de la slide [h][v], o cadena vacía si no existe. */
export function notesAt(notes, h, v) {
  return notes[h]?.[v] ?? '';
}
