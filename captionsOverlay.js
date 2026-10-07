/**
 * Capa de subtítulos sobre la presentación (CAM-TSK-0118). Pinta la
 * instantánea del motor (captionsEngine): una línea por frase, la provisional
 * marcada. Traduciendo, cada línea muestra su traducción y, mientras llega, el
 * original como pendiente. Está en la ventana principal y no la ocultan los
 * controles (H), así que sale en la grabación. Se pinta siempre como texto.
 */

export function renderCaptions(overlay, snapshot, { translated = false } = {}) {
  const visible = snapshot.status === 'listening' && snapshot.lines.length > 0;
  overlay.hidden = !visible;
  if (!visible) {
    overlay.replaceChildren();
    return;
  }
  overlay.replaceChildren(...snapshot.lines.map(line => {
    const element = document.createElement('p');
    const text = translated ? line.translation ?? line.text : line.text;
    const pending = translated ? line.translation == null : !line.final;
    element.className = 'caption-line';
    element.classList.toggle('is-pending', pending);
    element.textContent = text;
    return element;
  }));
}
