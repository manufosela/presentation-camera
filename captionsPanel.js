/**
 * Transcripción de los subtítulos en el panel de control (CAM-TSK-0119): la
 * ventana principal publica cada frase final (y su traducción cuando llega)
 * por el canal compartido, y el panel la valida y la acumula. El panel no sale
 * en la grabación: es para que el presentador revise lo dicho.
 */

export const CAPTIONS_LINE = 'captions:line';
export const CAPTIONS_CLEAR = 'captions:clear';
const MAX_TEXT = 1000;

/** Mensaje para el panel con una frase final. */
export const captionsMessage = ({ id, text, translation }) => ({ type: CAPTIONS_LINE, id, text, translation: translation ?? null });

const validText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_TEXT;

/** La frase recibida, normalizada, o null si no es un mensaje válido. */
export function parseCaptionsMessage(data) {
  if (data?.type !== CAPTIONS_LINE || !Number.isInteger(data.id) || data.id < 1 || !validText(data.text)) return null;
  const translation = data.translation ?? null;
  if (translation !== null && !validText(translation)) return null;
  return { id: data.id, text: data.text.trim(), translation: translation?.trim() ?? null };
}

/** Lista de la transcripción: una entrada por frase, actualizable por id. */
export function createTranscript(list, { maxEntries = 500 } = {}) {
  const items = new Map();

  function render(item, { text, translation }) {
    const original = document.createElement('span');
    original.className = 'transcript-text';
    original.textContent = text;
    item.replaceChildren(original);
    if (translation) {
      const translated = document.createElement('span');
      translated.className = 'transcript-translation';
      translated.textContent = translation;
      item.append(' ', translated);
    }
  }

  return {
    add(entry) {
      let item = items.get(entry.id);
      if (!item) {
        item = document.createElement('li');
        items.set(entry.id, item);
        list.append(item);
      }
      render(item, entry);
      while (items.size > maxEntries) {
        const [oldest, element] = items.entries().next().value;
        element.remove();
        items.delete(oldest);
      }
    },
    clear() {
      items.clear();
      list.replaceChildren();
    },
  };
}
