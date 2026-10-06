// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { buildPdfDeck, pdfDeckNavigator } from './pdfDeck.js';
import { revealSlideFromMessage } from './deckKeys.js';

const page = n => ({ src: `data:image/webp;base64,${btoa(`p${n}`)}`, width: 1600, height: 900 });

describe('buildPdfDeck — HTML autocontenido con una página por slide', () => {
  it('una sección por página, con su imagen y el título escapado', () => {
    const html = buildPdfDeck({ title: 'Charla <2026>', pages: [page(1), page(2), page(3)] });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.title).toBe('Charla <2026>');
    expect(doc.querySelectorAll('section')).toHaveLength(3);
    expect(doc.querySelector('section img').getAttribute('src')).toBe(page(1).src);
    expect(doc.querySelector('section img').getAttribute('alt')).toBe('1 / 3');
    expect(html).not.toContain('<2026>'); // escapado
  });

  it('solo acepta imágenes data:image en base64 (nada de URLs externas ni comillas inyectadas)', () => {
    const bad = ['https://evil.example/a.png', 'data:image/png;base64,AA" onerror="alert(1)', 'data:text/html;base64,AA'];
    for (const src of bad) {
      expect(() => buildPdfDeck({ title: 'x', pages: [{ src, width: 1, height: 1 }] })).toThrow(/data:image/);
    }
  });

  it('sin páginas falla de forma visible', () => {
    expect(() => buildPdfDeck({ title: 'x', pages: [] })).toThrow(/página/);
  });
});

describe('pdfDeckNavigator — navegación compatible con reveal.js', () => {
  let posted;
  let win;

  beforeEach(() => {
    document.body.innerHTML = '<section></section><section></section><section></section>';
    document.body.className = '';
    posted = [];
    const listeners = {};
    win = {
      parent: { postMessage: data => posted.push(data) },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      send: command => listeners.message({ data: JSON.stringify(command) }),
      key: key => listeners.keydown({ key, preventDefault() {} }),
    };
    pdfDeckNavigator(win, document, 3);
  });

  const current = () => [...document.querySelectorAll('section')].findIndex(s => s.classList.contains('present'));
  const lastSlide = () => revealSlideFromMessage(posted.at(-1));

  it('arranca en la primera y avisa «ready» con la posición', () => {
    expect(current()).toBe(0);
    expect(lastSlide()).toEqual({ h: 0, v: 0 });
  });

  it('next/right/down avanzan, prev/left/up retroceden, sin salirse', () => {
    win.send({ method: 'next', args: [] });
    win.send({ method: 'right', args: [] });
    win.send({ method: 'down', args: [] });
    expect(current()).toBe(2);
    expect(lastSlide()).toEqual({ h: 2, v: 0 });
    win.send({ method: 'left', args: [] });
    win.send({ method: 'prev', args: [] });
    win.send({ method: 'up', args: [] });
    expect(current()).toBe(0);
  });

  it('slide(n) va a esa página (acotada); slide(MAX) a la última', () => {
    win.send({ method: 'slide', args: [1] });
    expect(current()).toBe(1);
    win.send({ method: 'slide', args: [Number.MAX_SAFE_INTEGER] });
    expect(current()).toBe(2);
  });

  it('getIndices responde como reveal', () => {
    win.send({ method: 'slide', args: [1] });
    win.send({ method: 'getIndices', args: [] });
    expect(lastSlide()).toEqual({ h: 1, v: 0 });
  });

  it('togglePause funde a negro y toggleOverview muestra la vista general', () => {
    win.send({ method: 'togglePause', args: [] });
    expect(document.body.classList.contains('paused')).toBe(true);
    win.send({ method: 'toggleOverview', args: [] });
    expect(document.body.classList.contains('overview')).toBe(true);
  });

  it('con el foco dentro, las flechas también navegan', () => {
    win.key('ArrowRight');
    expect(current()).toBe(1);
    win.key('End');
    expect(current()).toBe(2);
    win.key('Home');
    expect(current()).toBe(0);
  });

  it('ignora mensajes que no son comandos', () => {
    win.send({ method: 'borrarTodo', args: [] });
    win.addEventListener('noop', () => {});
    expect(current()).toBe(0);
  });
});
