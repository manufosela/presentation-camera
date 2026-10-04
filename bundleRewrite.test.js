import { describe, expect, it } from 'vitest';
import { resolveBundlePath, rewriteCssRefs } from './bundleRewrite.js';
import { bundleLookup as lookup } from './test-support/bundleFixtures.js';

describe('resolveBundlePath — rutas relativas dentro de la carpeta', () => {
  it('resuelve relativas a su directorio, con ./ y ../', () => {
    expect(resolveBundlePath('', 'css/theme.css')).toBe('css/theme.css');
    expect(resolveBundlePath('css/', './fonts/a.woff2')).toBe('css/fonts/a.woff2');
    expect(resolveBundlePath('css/', '../img/logo.png')).toBe('img/logo.png');
  });

  it('una ruta absoluta (/x) cuenta desde la raíz del bundle', () => {
    expect(resolveBundlePath('css/', '/img/logo.png')).toBe('img/logo.png');
  });

  it('quita query y fragmento, y decodifica', () => {
    expect(resolveBundlePath('', 'img/logo.png?v=2#x')).toBe('img/logo.png');
    expect(resolveBundlePath('', 'img/mi%20logo.png')).toBe('img/mi logo.png');
  });

  it('las URLs externas, data:, blob: y anclas no son del bundle', () => {
    for (const ref of ['https://cdn.example/x.js', '//cdn.example/x.js', 'data:image/png;base64,AA', 'blob:abc', '#slide-2', 'mailto:a@b.c', '']) {
      expect(resolveBundlePath('', ref)).toBeNull();
    }
  });

  it('no deja salir de la raíz con ../ de más', () => {
    expect(resolveBundlePath('', '../../etc/passwd')).toBeNull();
  });

  it('decodifica cada segmento antes de tratar . y ..', () => {
    expect(resolveBundlePath('css/', '%2e%2e/img/logo.png')).toBe('img/logo.png');
    expect(resolveBundlePath('', '%2e%2e/x')).toBeNull();
    expect(resolveBundlePath('', 'img%2Flogo.png')).toBeNull(); // barra codificada dentro de un nombre
  });
});

describe('rewriteCssRefs — url() e @import', () => {
  it('reescribe url() con y sin comillas, relativas al CSS', () => {
    const css = `@font-face { src: url("fonts/a.woff2") } .bg { background: url(../img/bg.jpg) } .x { background: url('https://cdn/x.png') }`;
    const { css: out, unresolved } = rewriteCssRefs(css, 'css/', lookup);
    expect(out).toContain('url("blob:css/fonts/a.woff2")');
    expect(out).toContain('url("blob:img/bg.jpg")');
    expect(out).toContain("url('https://cdn/x.png')");
    expect(unresolved).toEqual([]);
  });

  it('conserva el fragmento (sprites SVG) y descarta la query', () => {
    const { css: out } = rewriteCssRefs('.i { mask: url(../img/logo.png?v=3#icon) }', 'css/', lookup);
    expect(out).toContain('url("blob:img/logo.png#icon")');
  });

  it('reescribe @import "..." y apunta lo que no existe', () => {
    const { css: out, unresolved } = rewriteCssRefs('@import "theme.css"; @import url(missing.css);', 'css/', lookup);
    expect(out).toContain('@import "blob:css/theme.css"');
    expect(unresolved).toEqual(['css/missing.css']);
  });
});
