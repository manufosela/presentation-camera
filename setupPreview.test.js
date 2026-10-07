// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createSetupPreview } from './setupPreview.js';

const APP = 'https://app.test';
const remote = { id: 'r1', type: 'url', url: 'https://slides.test/deck', title: 'Charla' };
const local = { id: 'l1', type: 'html', localRef: 'x', title: 'Taller' };

let host;
beforeEach(() => { host = document.createElement('div'); });

function preview(resolveSrc = async source => source.url ?? `blob:${APP}/${source.id}`) {
  return createSetupPreview({ host, appOrigin: APP, resolveSrc, titleFor: source => `Vista previa: ${source.title}` });
}
const frames = () => [...host.querySelectorAll('iframe')];

describe('createSetupPreview — la diapositiva real en la vista previa', () => {
  it('pinta la presentación activa en un iframe con el mismo aislamiento que en directo', async () => {
    await preview().show(remote);
    const [frame] = frames();
    expect(frame.getAttribute('src')).toBe('https://slides.test/deck');
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(frame.title).toBe('Vista previa: Charla');
    expect(frame.tabIndex).toBe(-1);
  });

  it('un HTML local va en un origin opaco', async () => {
    await preview().show(local);
    expect(frames()[0].getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('la misma presentación no se recarga', async () => {
    const p = preview();
    await p.show(remote);
    const first = frames()[0];
    await p.show({ ...remote });
    expect(frames()).toEqual([first]);
  });

  it('otra presentación sustituye a la anterior', async () => {
    const p = preview();
    await p.show(remote);
    await p.show(local);
    expect(frames()).toHaveLength(1);
    expect(frames()[0].getAttribute('src')).toBe(`blob:${APP}/l1`);
  });

  it('si llegan dos peticiones seguidas, gana la última', async () => {
    let releaseSlow;
    const p = preview(source => (source.id === 'r1'
      ? new Promise(resolve => { releaseSlow = () => resolve(source.url); })
      : Promise.resolve(`blob:${APP}/${source.id}`)));
    const slow = p.show(remote);
    await p.show(local);
    releaseSlow();
    await slow;
    expect(frames().map(f => f.getAttribute('src'))).toEqual([`blob:${APP}/l1`]);
  });

  it('sin presentación, o sin fichero que mostrar, la vista previa queda vacía', async () => {
    const p = preview(async source => (source.id === 'l1' ? null : source.url));
    await p.show(remote);
    await p.show(null);
    expect(frames()).toEqual([]);
    await p.show(local);
    expect(frames()).toEqual([]);
  });

  it('clear() la libera (al empezar a presentar)', async () => {
    const p = preview();
    await p.show(remote);
    p.clear();
    expect(frames()).toEqual([]);
    await p.show(remote); // al volver se pinta de nuevo
    expect(frames()).toHaveLength(1);
  });
});
