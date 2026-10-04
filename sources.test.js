// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createSourcesStore, MAX_SOURCES, SOURCES_STORAGE_KEY } from './sources.js';

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

  it('addLocal() marca bundle:true para carpetas y false por defecto, y lo persiste', () => {
    const store = createSourcesStore();
    const single = store.addLocal({ type: 'html', title: 'single', localRef: 'a' });
    const bundle = store.addLocal({ type: 'html', title: 'bundle', localRef: 'b', bundle: true });
    expect(single.bundle).toBe(false);
    expect(bundle.bundle).toBe(true);
    const reloaded = createSourcesStore();
    expect(reloaded.list().find(s => s.localRef === 'b').bundle).toBe(true);
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

describe('addLocal — volver a cargar el mismo HTML local lo reemplaza', () => {
  it('mismo título y tipo: misma entrada (mismo id), localRef nuevo, activa y sin duplicar', () => {
    const store = createSourcesStore();
    store.add('https://otra.test');
    const first = store.addLocal({ type: 'html', title: 'charla', localRef: 'opfs-1' });
    store.setActive(0);
    const again = store.addLocal({ type: 'html', title: 'charla', localRef: 'opfs-2' });
    expect(again.id).toBe(first.id);
    expect(again.localRef).toBe('opfs-2');
    expect(store.list()).toHaveLength(2);
    expect(store.getActive().id).toBe(first.id);
  });

  it('un .html y una carpeta con el mismo nombre son entradas distintas', () => {
    const store = createSourcesStore();
    store.addLocal({ type: 'html', title: 'charla', localRef: 'opfs-1' });
    store.addLocal({ type: 'html', title: 'charla', localRef: 'bundle-1', bundle: true });
    expect(store.list()).toHaveLength(2);
  });

  it('findLocal devuelve la entrada existente (para borrar su fichero viejo)', () => {
    const store = createSourcesStore();
    store.addLocal({ type: 'html', title: 'charla', localRef: 'opfs-1' });
    expect(store.findLocal({ title: 'charla', bundle: false })).toMatchObject({ localRef: 'opfs-1' });
    expect(store.findLocal({ title: 'otra', bundle: false })).toBeNull();
  });

  it('con la lista llena, reemplazar sigue funcionando', () => {
    const store = createSourcesStore();
    store.addLocal({ type: 'html', title: 'charla', localRef: 'opfs-1' });
    for (let i = 0; i < MAX_SOURCES - 1; i++) store.add(`https://s${i}.test`);
    expect(store.isFull()).toBe(true);
    expect(store.addLocal({ type: 'html', title: 'charla', localRef: 'opfs-2' })).toMatchObject({ localRef: 'opfs-2' });
  });
});

describe('isFull — límite de sources (MAX_SOURCES)', () => {
  it('false con hueco, true al llegar al límite; add y addLocal devuelven null y no cambian la lista', () => {
    const store = createSourcesStore();
    for (let i = 0; i < MAX_SOURCES - 1; i++) store.add(`https://s${i}.test`);
    expect(store.isFull()).toBe(false);
    store.add('https://last.test');
    expect(store.isFull()).toBe(true);
    expect(store.add('https://overflow.test')).toBeNull();
    expect(store.addLocal({ type: 'html', localRef: 'opfs-x' })).toBeNull();
    expect(store.list()).toHaveLength(MAX_SOURCES);
  });

  it('con la lista llena, añadir una URL ya existente la activa (no es un desbordamiento)', () => {
    const store = createSourcesStore();
    for (let i = 0; i < MAX_SOURCES; i++) store.add(`https://s${i}.test`);
    expect(store.add('https://s3.test')).toMatchObject({ url: 'https://s3.test' });
    expect(store.getActiveIndex()).toBe(3);
  });
});
