// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createSourcesStore, SOURCES_STORAGE_KEY } from './sources.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('createSourcesStore — sources de tipo URL (comportamiento existente)', () => {
  it('add() crea una source con type "url" por defecto', () => {
    const store = createSourcesStore();
    const item = store.add('https://example.com/p', 'Demo');
    expect(item).toMatchObject({ type: 'url', url: 'https://example.com/p', title: 'Demo' });
    expect(item.id).toBeTruthy();
    expect(store.list()).toHaveLength(1);
  });

  it('add() ignora duplicados por URL y activa el existente', () => {
    const store = createSourcesStore();
    store.add('https://a.test');
    store.add('https://b.test');
    store.add('https://a.test');
    expect(store.list()).toHaveLength(2);
    expect(store.getActive().url).toBe('https://a.test');
  });
});

describe('createSourcesStore — sources HTML locales (nuevo)', () => {
  it('addLocal() crea una source type "html" con localRef y sin url pública', () => {
    const store = createSourcesStore();
    const item = store.addLocal({ type: 'html', title: 'Mi charla', localRef: 'opfs-123' });
    expect(item).toMatchObject({ type: 'html', title: 'Mi charla', localRef: 'opfs-123' });
    expect(item.url).toBeUndefined();
    expect(item.id).toBeTruthy();
    expect(store.getActive()).toBe(store.list()[0]);
  });

  it('addLocal() rechaza entradas sin localRef (sin fallback silencioso)', () => {
    const store = createSourcesStore();
    expect(store.addLocal({ type: 'html', title: 'X' })).toBeNull();
    expect(store.list()).toHaveLength(0);
  });

  it('convive una source url y una html en la misma lista y atajos por índice', () => {
    const store = createSourcesStore();
    store.add('https://remote.test', 'Remota');
    store.addLocal({ type: 'html', title: 'Local', localRef: 'opfs-9' });
    expect(store.list().map(s => s.type)).toEqual(['url', 'html']);
    store.setActive(0);
    expect(store.getActive().type).toBe('url');
    store.setActive(1);
    expect(store.getActive().type).toBe('html');
  });
});

describe('persistencia y retrocompatibilidad', () => {
  it('persiste type y localRef en localStorage y los rehidrata en una nueva instancia', () => {
    const store = createSourcesStore();
    store.addLocal({ type: 'html', title: 'Persistida', localRef: 'opfs-keep' });
    const reloaded = createSourcesStore();
    expect(reloaded.list()).toHaveLength(1);
    expect(reloaded.list()[0]).toMatchObject({ type: 'html', localRef: 'opfs-keep' });
  });

  it('lee items antiguos sin "type" como type "url" (retrocompat)', () => {
    window.localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify({
      list: [{ id: 'old1', url: 'https://legacy.test', title: 'Legacy' }],
      activeIndex: 0,
      revision: 3,
    }));
    const store = createSourcesStore();
    expect(store.list()[0]).toMatchObject({ type: 'url', url: 'https://legacy.test' });
  });
});

describe('hydrate — sync entre ventanas con tipos', () => {
  it('hydrate aplica un snapshot con sources html si la revisión es mayor', () => {
    const store = createSourcesStore();
    const applied = store.hydrate({
      list: [{ id: 'h1', type: 'html', title: 'Remota-local', localRef: 'opfs-x' }],
      activeIndex: 0,
      revision: 99,
    });
    expect(applied).toBe(true);
    expect(store.list()[0]).toMatchObject({ type: 'html', localRef: 'opfs-x' });
  });
});
