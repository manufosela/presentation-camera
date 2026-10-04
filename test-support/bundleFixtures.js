// Fixture compartido por los tests de bundleRewrite: los ficheros conocidos del
// bundle se convierten en "blob:<ruta>"; el resto, null (no encontrado).
const files = new Set(['index.html', 'css/theme.css', 'css/fonts/a.woff2', 'img/logo.png', 'img/bg.jpg', 'js/reveal.js', 'plugin/notes.js']);

export const bundleLookup = path => (files.has(path) ? `blob:${path}` : null);
