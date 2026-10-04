// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { rewriteHtmlRefs } from './bundleRewrite.js';
import { bundleLookup as lookup } from './test-support/bundleFixtures.js';

const parse = html => new DOMParser().parseFromString(html, 'text/html');

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
    const doc = parse(out);
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
    expect(parse(out).querySelector('img').getAttribute('srcset')).toBe(`${dataUri} 1x, blob:img/logo.png 2x, blob:img/bg.jpg 3x`);
    expect(unresolved).toEqual([]);
  });

  it('conserva el fragmento en atributos', () => {
    const { html: out } = rewriteHtmlRefs('<img src="img/logo.png#frag">', lookup);
    expect(parse(out).querySelector('img').getAttribute('src')).toBe('blob:img/logo.png#frag');
  });

  it('conserva el doctype', () => {
    const { html: out } = rewriteHtmlRefs('<!DOCTYPE html><html><body></body></html>', lookup);
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('conserva un doctype con identificadores PUBLIC y SYSTEM', () => {
    const doctype = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">';
    const { html: out } = rewriteHtmlRefs(`${doctype}<html><body></body></html>`, lookup);
    expect(out.startsWith(doctype)).toBe(true);
  });
});
