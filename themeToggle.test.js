// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { bindThemeToggle } from './themeToggle.js';
import { setLang } from './i18n.js';

beforeEach(() => setLang('es', null));

function fakeTheme(initial) {
  let theme = initial;
  const listeners = [];
  return {
    current: () => theme,
    toggle: () => { theme = theme === 'dark' ? 'light' : 'dark'; listeners.forEach(fn => fn(theme)); return theme; },
    onChange: fn => listeners.push(fn),
    systemChanges: next => { theme = next; listeners.forEach(fn => fn(theme)); },
  };
}

describe('bindThemeToggle — botón sol/luna', () => {
  it('ofrece el tema contrario con su etiqueta accesible', () => {
    const button = document.createElement('button');
    bindThemeToggle(button, fakeTheme('dark'));
    expect(button.getAttribute('aria-label')).toBe('Cambiar a tema claro');
    expect(button.textContent).toBe('☀');
  });

  it('al pulsarlo alterna el tema y actualiza la etiqueta', () => {
    const button = document.createElement('button');
    const theme = fakeTheme('dark');
    bindThemeToggle(button, theme);
    button.click();
    expect(theme.current()).toBe('light');
    expect(button.getAttribute('aria-label')).toBe('Cambiar a tema oscuro');
    expect(button.textContent).toBe('☾');
  });

  it('si el sistema cambia el tema, la etiqueta se actualiza', () => {
    const button = document.createElement('button');
    const theme = fakeTheme('dark');
    bindThemeToggle(button, theme);
    theme.systemChanges('light');
    expect(button.getAttribute('aria-label')).toBe('Cambiar a tema oscuro');
  });

  it('al cambiar de idioma, la etiqueta cambia de idioma', () => {
    const button = document.createElement('button');
    bindThemeToggle(button, fakeTheme('dark'));
    setLang('en', null);
    expect(button.getAttribute('aria-label')).toBe('Switch to light theme');
  });

  it('sin theme.js cargado falla de forma visible', () => {
    expect(() => bindThemeToggle(document.createElement('button'), undefined)).toThrow(/theme\.js/);
  });
});
