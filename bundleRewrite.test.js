// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { resolveBundlePath, rewriteCssRefs, rewriteHtmlRefs } from './bundleRewrite.js';

// lookup de prueba: los ficheros conocidos del bundle se convierten en "blob:<ruta>".
const files = new Set(['index.html', 'css/theme.css', 'css/fonts/a.woff2', 'img/logo.png', 'img/bg.jpg', 'js/reveal.js', 'plugin/notes.js']);
const lookup = path => (files.has(path) ? `blob:${path}` : null);

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

describe('rewriteHtmlRefs — referencias estáticas del documento', () => {
  it('reescribe src, href, srcset, estilos en línea y <style>', () => {
    const html = `<html><head>
      <link rel="stylesheet" href="css/theme.css">
      <style>.a { background: url(img/bg.jpg) }</style>
      <script src="js/reveal.js"></script>
    </head><body>
      <img src="img/logo.png" srcset="img/logo.png 1x, img/bg.jpg 2x">
      <div style="background-image: url('img/bg.jpg')"></div>
      <a href="#/2">siguiente</a>
      <script src="https://cdn.example/x.js"></script>
      <script src="plugin/missing.js"></script>
    </body></html>`;
    const { html: out, unresolved } = rewriteHtmlRefs(html, lookup);
    const doc = new DOMParser().parseFromString(out, 'text/html');
    expect(doc.querySelector('link').getAttribute('href')).toBe('blob:css/theme.css');
    expect(doc.querySelector('head script').getAttribute('src')).toBe('blob:js/reveal.js');
    expect(doc.querySelector('img').getAttribute('src')).toBe('blob:img/logo.png');
    expect(doc.querySelector('img').getAttribute('srcset')).toBe('blob:img/logo.png 1x, blob:img/bg.jpg 2x');
    expect(doc.querySelector('style').textContent).toContain('url("blob:img/bg.jpg")');
    expect(doc.querySelector('div').getAttribute('style')).toContain('url("blob:img/bg.jpg")');
    expect(doc.querySelector('a').getAttribute('href')).toBe('#/2');
    expect(doc.querySelector('script[src^="https"]')).not.toBeNull();
    expect(unresolved).toEqual(['plugin/missing.js']);
  });

  it('srcset con data: URIs (llevan comas) no se rompe', () => {
    const dataUri = "data:image/svg+xml,<svg%20a='1,2'/>";
    const { html: out, unresolved } = rewriteHtmlRefs(`<img srcset="${dataUri} 1x, img/logo.png 2x,img/bg.jpg 3x">`, lookup);
    const srcset = new DOMParser().parseFromString(out, 'text/html').querySelector('img').getAttribute('srcset');
    expect(srcset).toBe(`${dataUri} 1x, blob:img/logo.png 2x, blob:img/bg.jpg 3x`);
    expect(unresolved).toEqual([]);
  });

  it('conserva el fragmento en atributos', () => {
    const { html: out } = rewriteHtmlRefs('<img src="img/logo.png#frag">', lookup);
    expect(new DOMParser().parseFromString(out, 'text/html').querySelector('img').getAttribute('src')).toBe('blob:img/logo.png#frag');
  });

  it('conserva el doctype', () => {
    const { html: out } = rewriteHtmlRefs('<!DOCTYPE html><html><body></body></html>', lookup);
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
  });
});
