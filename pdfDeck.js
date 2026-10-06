/**
 * Deck HTML a partir de las páginas de un PDF (CAM-TSK-0076).
 *
 * Al cargar un PDF, cada página se pinta como imagen y se genera un HTML
 * autocontenido con una página por slide. Se guarda como cualquier HTML
 * local, así que reutiliza el iframe aislado, el puente de teclas, el panel y
 * la grabación. Entiende los mismos comandos postMessage que reveal.js (los que
 * envía deckKeys.js) y avisa de cada cambio de slide igual que reveal.
 */

/**
 * Navegación del deck. Se ejecuta DENTRO del deck generado (se incrusta con
 * toString), así que no puede usar nada de fuera de esta función.
 */
export function pdfDeckNavigator(win, doc, total) {
  const sections = [...doc.querySelectorAll('section')];
  let index = 0;
  const report = (eventName, extra) => win.parent.postMessage(JSON.stringify({
    namespace: 'reveal', eventName, state: { indexh: index, indexv: 0 }, ...extra,
  }), '*');
  const show = target => {
    index = Math.max(0, Math.min(total - 1, target));
    sections.forEach((section, i) => section.classList.toggle('present', i === index));
    report('slidechanged');
  };
  const toggle = name => doc.body.classList.toggle(name);
  const commands = {
    next: () => show(index + 1), right: () => show(index + 1), down: () => show(index + 1),
    prev: () => show(index - 1), left: () => show(index - 1), up: () => show(index - 1),
    slide: target => show(Number(target) || 0),
    togglePause: () => toggle('paused'),
    toggleOverview: () => toggle('overview'),
    getIndices: () => win.parent.postMessage(JSON.stringify({
      namespace: 'reveal', eventName: 'callback', method: 'getIndices', result: { h: index, v: 0 },
    }), '*'),
    configure: () => {},
  };
  const keys = {
    ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next', ' ': 'next',
    ArrowLeft: 'prev', ArrowUp: 'prev', PageUp: 'prev',
    b: 'togglePause', B: 'togglePause', '.': 'togglePause', Escape: 'toggleOverview',
  };

  win.addEventListener('message', event => {
    let command;
    try { command = typeof event.data === 'string' ? JSON.parse(event.data) : null; } catch { return; }
    const run = Object.hasOwn(commands, command?.method) ? commands[command.method] : null;
    if (run) run(...(Array.isArray(command.args) ? command.args : []));
  });
  win.addEventListener('keydown', event => {
    if (event.key === 'Home') show(0);
    else if (event.key === 'End') show(total - 1);
    else if (Object.hasOwn(keys, event.key)) commands[keys[event.key]]();
    else return;
    event.preventDefault();
  });
  // En la vista general, un clic en una página va a ella.
  sections.forEach((section, i) => section.addEventListener('click', () => {
    if (!doc.body.classList.contains('overview')) return;
    doc.body.classList.remove('overview');
    show(i);
  }));

  sections.forEach((section, i) => section.classList.toggle('present', i === 0));
  report('ready');
}

const escapeHtml = text => String(text).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
// Solo imágenes en base64: sin comillas ni nada que pueda salir del atributo.
const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z\d+/]+=*$/;

const STYLE = `
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  section { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; }
  section.present { display: flex; }
  section img { max-width: 100%; max-height: 100%; object-fit: contain; }
  body.paused section { visibility: hidden; }
  body.overview { overflow: auto; }
  body.overview section { position: static; display: inline-flex; width: 23%; aspect-ratio: 16 / 9;
    margin: 1%; outline: 2px solid #333; cursor: pointer; }
  body.overview section.present { outline-color: #f5a623; }`;

/** HTML del deck: una sección por página (imágenes data:image). */
export function buildPdfDeck({ title, pages }) {
  if (!pages.length) throw new Error('El PDF no tiene ninguna página.');
  const sections = pages.map(({ src }, i) => {
    if (!DATA_IMAGE.test(src)) throw new Error('Las páginas tienen que ser imágenes data:image en base64.');
    return `<section><img src="${src}" alt="${i + 1} / ${pages.length}"></section>`;
  }).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>`
    + `<style>${STYLE}</style></head><body>\n${sections}\n`
    + `<script>(${pdfDeckNavigator.toString()})(window, document, ${pages.length});</script></body></html>`;
}
