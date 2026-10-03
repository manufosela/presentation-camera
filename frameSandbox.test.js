import { describe, expect, it } from 'vitest';
import { sandboxForSource } from './frameSandbox.js';

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

  it('source remota: sin sandbox (fuera del alcance de esta función por ahora)', () => {
    expect(sandboxForSource({ type: 'url', url: 'https://example.com' })).toBeNull();
  });
});
