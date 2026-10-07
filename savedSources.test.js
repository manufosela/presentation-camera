// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { recentKey, removedLocalFiles, sourceLabel } from './savedSources.js';
import { setLang } from './i18n.js';

beforeEach(() => setLang('es', null));

describe('sourceLabel — cómo se ve cada presentación guardada', () => {
  it('en inglés, el tipo y el título por defecto en inglés', () => {
    setLang('en', null);
    expect(sourceLabel({ type: 'html', title: null, localRef: 'a' })).toEqual({ title: 'Untitled presentation', kind: 'Local HTML' });
    expect(sourceLabel({ type: 'html', bundle: true, title: 'x', localRef: 'b' }).kind).toBe('Folder');
  });

  it('HTML local de un solo fichero', () => {
    expect(sourceLabel({ type: 'html', title: 'charla', localRef: 'a' })).toEqual({ title: 'charla', kind: 'HTML local' });
  });

  it('carpeta local', () => {
    expect(sourceLabel({ type: 'html', bundle: true, title: 'mi-deck', localRef: 'b' })).toEqual({ title: 'mi-deck', kind: 'Carpeta' });
  });

  it('URL con título: el tipo es su dominio', () => {
    expect(sourceLabel({ type: 'url', url: 'https://www.slides.example/deck', title: 'Mi charla' }))
      .toEqual({ title: 'Mi charla', kind: 'slides.example' });
  });

  it('URL sin título: se usa el dominio como título', () => {
    expect(sourceLabel({ type: 'url', url: 'https://slides.example/deck', title: null }))
      .toEqual({ title: 'slides.example', kind: 'slides.example' });
  });

  it('local sin título', () => {
    expect(sourceLabel({ type: 'html', title: null, localRef: 'a' }).title).toBe('Presentación sin título');
  });
});

describe('recentKey — la tecla de cada reciente (CAM-TSK-0089)', () => {
  it('las nueve primeras tienen su tecla 1–9; las demás, ninguna', () => {
    expect([0, 1, 8, 9, 11].map(recentKey)).toEqual(['1', '2', '9', null, null]);
  });
});

describe('removedLocalFiles — ficheros locales que quedan huérfanos al quitar entradas', () => {
  const html = { id: '1', type: 'html', title: 'a', localRef: 'opfs-a', bundle: false };
  const bundle = { id: '2', type: 'html', title: 'b', localRef: 'opfs-b', bundle: true };
  const url = { id: '3', type: 'url', url: 'https://x.example' };

  it('devuelve los ficheros de las sources locales que ya no están', () => {
    expect(removedLocalFiles([html, bundle, url], [url])).toEqual([
      { localRef: 'opfs-a', bundle: false },
      { localRef: 'opfs-b', bundle: true },
    ]);
  });

  it('una source reemplazada (mismo id, fichero nuevo) también libera el viejo', () => {
    expect(removedLocalFiles([html], [{ ...html, localRef: 'opfs-a2' }])).toEqual([{ localRef: 'opfs-a', bundle: false }]);
  });

  it('sin cambios o solo URLs quitadas → nada que borrar', () => {
    expect(removedLocalFiles([html, url], [html, url])).toEqual([]);
    expect(removedLocalFiles([html, url], [html])).toEqual([]);
  });

  it('un fichero que sigue referenciado por otra entrada no se borra', () => {
    const twin = { ...html, id: '9' };
    expect(removedLocalFiles([html, twin], [twin])).toEqual([]);
  });
});
