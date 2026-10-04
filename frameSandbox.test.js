import { describe, expect, it } from 'vitest';
import { allowForSource, deckOrigin, sandboxForSource } from './frameSandbox.js';

const APP_ORIGIN = 'https://app.example';

describe('sandboxForSource — aislamiento de los iframes de presentación', () => {
  it('HTML local de un solo fichero: solo scripts, sin allow-same-origin (origin opaco)', () => {
    expect(sandboxForSource({ type: 'html', localRef: 'abc' })).toBe('allow-scripts');
  });

  it('el token devuelto nunca incluye allow-same-origin para HTML local', () => {
    expect(sandboxForSource({ type: 'html', localRef: 'abc' })).not.toContain('allow-same-origin');
  });

  it('bundle local (carpeta servida como blob URLs): también origin opaco', () => {
    expect(sandboxForSource({ type: 'html', bundle: true, localRef: 'abc' })).toBe('allow-scripts');
  });

  it('source remota: sandbox que conserva su propio origin pero no puede navegar la ventana principal', () => {
    const tokens = sandboxForSource({ type: 'url', url: 'https://example.com' }, APP_ORIGIN).split(' ');
    expect(tokens).toEqual(expect.arrayContaining(['allow-scripts', 'allow-same-origin', 'allow-popups', 'allow-forms']));
    expect(tokens.filter(t => t.startsWith('allow-top-navigation'))).toEqual([]);
  });

  it('URL del mismo origin que la app: origin opaco (con allow-same-origin podría quitarse el sandbox)', () => {
    expect(sandboxForSource({ type: 'url', url: `${APP_ORIGIN}/index.html` }, APP_ORIGIN)).toBe('allow-scripts');
  });

  it('URL no parseable: la política más restrictiva', () => {
    expect(sandboxForSource({ type: 'url', url: 'no es una url' }, APP_ORIGIN)).toBe('allow-scripts');
  });
});

describe('allowForSource — permisos (Permissions Policy) del iframe', () => {
  it('source remota: pantalla completa y autoplay para vídeos del deck', () => {
    expect(allowForSource({ type: 'url', url: 'https://example.com' })).toBe('fullscreen; autoplay');
  });

  it('HTML local: sin permisos extra', () => {
    expect(allowForSource({ type: 'html', localRef: 'abc' })).toBeNull();
  });
});

describe('deckOrigin — origin esperado en los mensajes del deck', () => {
  it('HTML local de un solo fichero (sandbox opaco) → "null"', () => {
    expect(deckOrigin({ type: 'html', localRef: 'abc' }, APP_ORIGIN)).toBe('null');
  });

  it('bundle local (sandbox opaco) → "null"', () => {
    expect(deckOrigin({ type: 'html', bundle: true, localRef: 'abc' }, APP_ORIGIN)).toBe('null');
  });

  it('remota de otro origin → su propio origin', () => {
    expect(deckOrigin({ type: 'url', url: 'https://slides.example/deck/#/2' }, APP_ORIGIN)).toBe('https://slides.example');
  });

  it('URL del mismo origin que la app (sandbox opaco) → "null"', () => {
    expect(deckOrigin({ type: 'url', url: `${APP_ORIGIN}/deck.html` }, APP_ORIGIN)).toBe('null');
  });
});
