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

// Luminancia relativa WCAG de un oklch(L C H): oklab → sRGB lineal.
const luminance = ([L, C, H]) => {
  const a = C * Math.cos(H * Math.PI / 180);
  const b = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = v => Math.min(1, Math.max(0, v));
  return 0.2126 * clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
    + 0.7152 * clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
    + 0.0722 * clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
};
const tokenColor = (text, name) =>
  text.match(new RegExp(`${name}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`)).slice(1).map(Number);
const contrast = (x, y) => {
  const [hi, lo] = [luminance(x), luminance(y)].toSorted((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};

describe('contraste AA del texto tenue (CAM-BUG-0021)', () => {
  const TEXT_BACKGROUNDS = ['--bg-deep', '--bg-base', '--bg-raised', '--bg-input'];
  it.each([':root', ':root[data-theme="light"]'])('%s: --ink-faint llega a 4,5:1 en los fondos de texto', selector => {
    const text = block(selector);
    const faint = tokenColor(text, '--ink-faint');
    for (const bg of TEXT_BACKGROUNDS) expect(contrast(faint, tokenColor(text, bg)), bg).toBeGreaterThanOrEqual(4.5);
  });
});

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
