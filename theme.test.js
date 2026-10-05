import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from './constants.js';

// theme.js es un script clásico (va síncrono en el <head> para no parpadear):
// se ejecuta en un contexto con window/document/localStorage/matchMedia falsos.
const source = readFileSync('theme.js', 'utf8');

function run({ stored = null, systemDark = true, storageThrows = false } = {}) {
  const store = new Map(stored ? [[STORAGE_KEYS.theme, stored]] : []);
  const media = { matches: systemDark, listeners: [], addEventListener(type, fn) { this.listeners.push(fn); } };
  const root = { dataset: {} };
  const window = {
    localStorage: {
      getItem: key => { if (storageThrows) throw new Error('blocked'); return store.get(key) ?? null; },
      setItem: (key, value) => { if (storageThrows) throw new Error('blocked'); store.set(key, value); },
    },
    matchMedia: query => { expect(query).toBe('(prefers-color-scheme: dark)'); return media; },
    document: { documentElement: root },
  };
  runInNewContext(source, { window, document: window.document });
  const systemChanges = dark => { media.matches = dark; media.listeners.forEach(fn => fn()); };
  return { root, store, api: window.camTheme, systemChanges };
}

describe('theme.js — tema antes de pintar', () => {
  it('sin elección guardada sigue al sistema', () => {
    expect(run({ systemDark: true }).root.dataset.theme).toBe('dark');
    expect(run({ systemDark: false }).root.dataset.theme).toBe('light');
  });

  it('sin elección guardada, cambia si cambia el sistema', () => {
    const { root, systemChanges } = run({ systemDark: true });
    systemChanges(false);
    expect(root.dataset.theme).toBe('light');
  });

  it('la elección guardada prevalece sobre el sistema, también si el sistema cambia', () => {
    const { root, systemChanges } = run({ stored: 'light', systemDark: true });
    expect(root.dataset.theme).toBe('light');
    systemChanges(true);
    expect(root.dataset.theme).toBe('light');
  });

  it('toggle alterna, aplica y recuerda', () => {
    const { root, store, api } = run({ systemDark: true });
    expect(api.toggle()).toBe('light');
    expect(root.dataset.theme).toBe('light');
    expect(store.get(STORAGE_KEYS.theme)).toBe('light');
    expect(api.current()).toBe('light');
  });

  it('avisa de cada cambio de tema, también los que vienen del sistema', () => {
    const { api, systemChanges } = run({ systemDark: true });
    const seen = [];
    api.onChange(theme => seen.push(theme));
    systemChanges(false);
    api.toggle();
    expect(seen).toEqual(['light', 'dark']);
  });

  it('un valor guardado no válido se ignora (sigue al sistema)', () => {
    expect(run({ stored: 'sepia', systemDark: false }).root.dataset.theme).toBe('light');
  });

  it('sin almacenamiento disponible funciona igual, sin recordar', () => {
    const { root, api } = run({ storageThrows: true, systemDark: true });
    expect(root.dataset.theme).toBe('dark');
    expect(api.toggle()).toBe('light');
    expect(root.dataset.theme).toBe('light');
  });
});
