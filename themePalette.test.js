import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Contrato de precam.css: la paleta clara redefine TODOS los tokens de color
// del tema oscuro (si faltara uno, ese elemento quedaría con el color oscuro).
const css = readFileSync('precam.css', 'utf8');

const block = selector => {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return null;
  return css.slice(start, css.indexOf('\n}', start));
};
const tokensIn = text => [...text.matchAll(/^\s*(--[\w-]+):/gm)].map(([, name]) => name);

const COLOR_TOKENS = tokensIn(block(':root'))
  .filter(name => /^--(bg|line|ink|accent|on-accent|live|focus|shadow|grain)/.test(name));

it('el texto sobre el ámbar usa el token --on-accent, no un color fijo', () => {
  expect(COLOR_TOKENS).toContain('--on-accent');
  expect(css).not.toMatch(/color:\s*oklch\(0\.18 0\.030 60\)/);
});

describe('paleta clara', () => {
  it('el tema oscuro tiene tokens de color', () => {
    expect(COLOR_TOKENS.length).toBeGreaterThan(15);
  });

  it('existe un bloque para data-theme="light" que declara color-scheme: light', () => {
    const light = block(':root[data-theme="light"]');
    expect(light).not.toBeNull();
    expect(light).toMatch(/color-scheme:\s*light/);
  });

  it('redefine todos los tokens de color del tema oscuro', () => {
    const light = tokensIn(block(':root[data-theme="light"]'));
    expect(COLOR_TOKENS.filter(name => !light.includes(name))).toEqual([]);
  });
});
