// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { MESSAGES } from './messages.js';
import { STORAGE_KEYS } from './constants.js';
import { LANGS, detectLang, getLang, initI18n, onLangChange, setLang, t, translateDom } from './i18n.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map };
}

beforeEach(() => setLang('es', memoryStorage()));

describe('detectLang — idioma por defecto', () => {
  it('el guardado manda', () => {
    expect(detectLang(memoryStorage({ [STORAGE_KEYS.lang]: 'en' }), ['es-ES'])).toBe('en');
  });

  it('sin guardado: español si el navegador está en español, si no inglés', () => {
    expect(detectLang(memoryStorage(), ['es-MX', 'en'])).toBe('es');
    expect(detectLang(memoryStorage(), ['fr-FR', 'es'])).toBe('en');
    expect(detectLang(memoryStorage(), [])).toBe('en');
  });

  it('un valor guardado no válido se ignora', () => {
    expect(detectLang(memoryStorage({ [STORAGE_KEYS.lang]: 'de' }), ['es'])).toBe('es');
  });
});

describe('t — textos traducidos', () => {
  it('devuelve el texto del idioma actual con sus parámetros', () => {
    setLang('en', memoryStorage());
    expect(t('lang.switch', {})).toBe(MESSAGES['lang.switch'].en);
  });

  it('una clave inexistente falla de forma visible', () => {
    expect(() => t('no.existe')).toThrow(/no\.existe/);
  });

  it('sustituye {parámetros}', () => {
    MESSAGES['test.params'] = { es: 'Hola {name}', en: 'Hi {name}' };
    expect(t('test.params', { name: 'Ana' })).toBe('Hola Ana');
    delete MESSAGES['test.params'];
  });
});

describe('setLang — cambiar de idioma', () => {
  it('lo recuerda, actualiza html lang y avisa', () => {
    const storage = memoryStorage();
    const seen = [];
    onLangChange(lang => seen.push(lang));
    setLang('en', storage);
    expect(getLang()).toBe('en');
    expect(storage.map.get(STORAGE_KEYS.lang)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(seen.at(-1)).toBe('en');
  });

  it('rechaza un idioma no soportado', () => {
    expect(() => setLang('fr', memoryStorage())).toThrow(/fr/);
  });
});

describe('translateDom — textos marcados en el HTML', () => {
  it('traduce data-i18n (texto) y data-i18n-attr (atributos)', () => {
    document.body.innerHTML = '<button data-i18n="lang.switch" data-i18n-attr="aria-label:lang.switchLabel,title:lang.switchLabel">x</button>';
    setLang('en', memoryStorage());
    translateDom(document);
    const button = document.querySelector('button');
    expect(button.textContent).toBe(MESSAGES['lang.switch'].en);
    expect(button.getAttribute('aria-label')).toBe(MESSAGES['lang.switchLabel'].en);
    expect(button.title).toBe(MESSAGES['lang.switchLabel'].en);
  });
});

describe('initI18n — arranque en la app y en el panel', () => {
  it('aplica el idioma detectado sin guardarlo y traduce la página', () => {
    document.body.innerHTML = '<button id="langBtn"></button>';
    const storage = memoryStorage();
    initI18n({ storage, languages: ['en-US'], button: document.getElementById('langBtn') });
    expect(getLang()).toBe('en');
    expect(storage.map.has(STORAGE_KEYS.lang)).toBe(false);
    expect(document.getElementById('langBtn').textContent).toBe(MESSAGES['lang.switch'].en);
  });

  it('el botón cambia al otro idioma, lo recuerda y retraduce', () => {
    document.body.innerHTML = '<button id="langBtn"></button>';
    const storage = memoryStorage();
    initI18n({ storage, languages: ['es-ES'], button: document.getElementById('langBtn') });
    document.getElementById('langBtn').click();
    expect(getLang()).toBe('en');
    expect(storage.map.get(STORAGE_KEYS.lang)).toBe('en');
    expect(document.getElementById('langBtn').getAttribute('aria-label')).toBe(MESSAGES['lang.switchLabel'].en);
  });

  it('si otra ventana cambia el idioma (evento storage), esta lo sigue', () => {
    document.body.innerHTML = '<button id="langBtn"></button>';
    initI18n({ storage: memoryStorage(), languages: ['es-ES'], button: document.getElementById('langBtn') });
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.lang, newValue: 'en' }));
    expect(getLang()).toBe('en');
  });
});

describe('HTML — toda clave marcada existe en el catálogo', () => {
  it.each(['index.html', 'panel.html'])('%s', file => {
    const html = readFileSync(file, 'utf8');
    const keys = [
      ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map(([, key]) => key),
      ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap(([, pairs]) => pairs.split(',').map(pair => pair.split(':')[1].trim())),
    ];
    expect(keys.filter(key => !(key in MESSAGES))).toEqual([]);
  });
});

describe('messages — catálogo completo', () => {
  it(`toda clave tiene texto en ${LANGS.join(' y ')}`, () => {
    const incomplete = Object.entries(MESSAGES)
      .filter(([, entry]) => LANGS.some(lang => typeof entry[lang] !== 'string' || !entry[lang].trim()))
      .map(([key]) => key);
    expect(incomplete).toEqual([]);
  });
});
