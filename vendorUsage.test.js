import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Todo lo que hay en vendor/ se despliega con caché larga: si nada de la app lo
// referencia, son bytes muertos (CAM-TSK-0040). Se buscan las rutas relativas
// en los ficheros de la app servidos (html, js, css y el manifest).
const APP_FILES = readdirSync('.')
  .filter(name => /\.(html|js|css|webmanifest)$/.test(name) && !name.endsWith('.test.js'));
const appText = APP_FILES.map(name => readFileSync(name, 'utf8')).join('\n');

const vendorFiles = readdirSync('vendor', { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => `${entry.parentPath}/${entry.name}`.replace(/^.*?vendor\//, 'vendor/'));

describe('vendor/ — sin ficheros muertos', () => {
  it('hay ficheros que comprobar', () => {
    expect(vendorFiles.length).toBeGreaterThan(0);
  });

  it.each(vendorFiles)('%s está referenciado por la app', file => {
    const name = file.replace(/^vendor\//, '');
    expect(appText.includes(file) || appText.includes(name)).toBe(true);
  });
});
