import { describe, expect, it } from 'vitest';
import { allowForSource, sandboxForSource } from './frameSandbox.js';

const APP_ORIGIN = 'https://app.example';

describe('sandboxForSource — aislamiento de los iframes de presentación', () => {
  it('HTML local de un solo fichero: solo scripts, sin allow-same-origin (origin opaco)', () => {
    expect(sandboxForSource({ type: 'html', localRef: 'abc' })).toBe('allow-scripts');
  });

  it('el token devuelto nunca incluye allow-same-origin para HTML local', () => {
    expect(sandboxForSource({ type: 'html', localRef: 'abc' })).not.toContain('allow-same-origin');
  });

  it('bundle local (carpeta servida por el Service Worker): sin sandbox, el SW no controla iframes de origin opaco', () => {
    expect(sandboxForSource({ type: 'html', bundle: true, localRef: 'abc' })).toBeNull();
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
