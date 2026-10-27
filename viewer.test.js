// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from './constants.js';

const BODY = readFileSync('404.html', 'utf8').match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
const FOUND = { fields: { uid: { stringValue: 'uid-ana' } } };

/** Abre el visor en `path` con la red que dé `fetchImpl`. */
async function openViewer(path, fetchImpl) {
  history.replaceState(null, '', path);
  document.body.innerHTML = BODY;
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  vi.resetModules();
  await import('./viewer.js');
  return { status: document.getElementById('viewerStatus'), frame: document.getElementById('viewerFrame') };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.setItem(STORAGE_KEYS.lang, 'es');
});
afterEach(() => vi.unstubAllGlobals());

describe('visor público (CAM-TSK-0180)', () => {
  it('pinta el deck en un iframe aislado, sin allow-same-origin, en UTF-8', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');
    const { status, frame } = await openViewer('/ana/mi-charla', async url =>
      (url.includes('firestore') ? new Response(JSON.stringify(FOUND)) : new Response('<h1>Hola</h1>')));
    await vi.waitFor(() => expect(frame.hidden).toBe(false));
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.src).toMatch(/^blob:/);
    expect(createObjectURL.mock.calls[0][0].type).toBe('text/html;charset=utf-8');
    expect(status.hidden).toBe(true);
    expect(document.getElementById('viewerName').textContent).toBe('ana / mi-charla');
  });

  it('una ruta que no es de deck o un deck que no existe dicen «no encontrado»', async () => {
    for (const path of ['/una/ruta/cualquiera', '/ana/mi-charla']) {
      const { status, frame } = await openViewer(path, async () => new Response('{}', { status: 404 }));
      await vi.waitFor(() => expect(status.dataset.i18n).toBe('viewer.notFound'));
      expect(frame.hidden).toBe(true);
    }
  });

  it('con el deck a la vista se puede denunciar, y se confirma al enviar (CAM-TSK-0181)', async () => {
    const { frame } = await openViewer('/ana/mi-charla', async (url, init) => {
      if (init?.method === 'POST') return new Response('{}');
      return url.includes('firestore') ? new Response(JSON.stringify(FOUND)) : new Response('<h1>Hola</h1>');
    });
    await vi.waitFor(() => expect(frame.hidden).toBe(false));
    const open = document.getElementById('reportOpen');
    expect(open.hidden).toBe(false);
    open.click();
    document.getElementById('reportReason').value = 'Suplanta a un banco';
    document.getElementById('reportSend').click();
    await vi.waitFor(() => expect(document.getElementById('reportStatus').value).toMatch(/onslide revisará/));
    const [, init] = fetch.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(init.body).writes[0].update.fields.reason).toEqual({ stringValue: 'Suplanta a un banco' });
  });

  it('un fallo de red pide comprobar la conexión, sin decir que no existe', async () => {
    const { status } = await openViewer('/ana/mi-charla', async () => { throw new TypeError('offline'); });
    await vi.waitFor(() => expect(status.dataset.i18n).toBe('viewer.failed'));
  });
});
