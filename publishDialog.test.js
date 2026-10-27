// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from './i18n.js';
import { createPublishDialog } from './publishDialog.js';
import { createPublisher } from './publishStore.js';
import { fakePublishSdk } from './test-support/fakePublishSdk.js';

const MARKUP = readFileSync('index.html', 'utf8').match(/<dialog id="publishDialog"[\s\S]*?<\/dialog>/)[0];
const DECK = { title: 'Mi Charla: Web', html: '<h1>Hola</h1>' };

let fake;
let ui;
const part = name => document.querySelector(`[data-publish="${name}"]`);
const visible = () => ['signIn', 'username', 'deck', 'result'].filter(name => !part(name).hidden);
const submit = name => part(name).dispatchEvent(new Event('submit', { cancelable: true }));

beforeEach(() => {
  setLang('es', null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  document.body.innerHTML = MARKUP;
  fake = fakePublishSdk();
  ui = createPublishDialog({
    dialog: document.getElementById('publishDialog'),
    loadPublisher: async () => createPublisher(fake.api, { origin: 'https://onsli.de' }),
  });
});

describe('diálogo de publicar (CAM-TSK-0175)', () => {
  it('sin sesión pide entrar con Google; luego, sin nombre, pide reservarlo', async () => {
    await ui.open(DECK);
    expect(document.getElementById('publishDialog').open).toBe(true);
    expect(visible()).toEqual(['signIn']);
    part('signIn').querySelector('button').click();
    await vi.waitFor(() => expect(visible()).toEqual(['username']));
  });

  it('reserva el nombre, sugiere el del deck y publica dando la URL', async () => {
    await fake.api.signInWithPopup();
    await ui.open(DECK);
    part('usernameInput').value = 'ana';
    submit('username');
    await vi.waitFor(() => expect(visible()).toEqual(['deck']));
    expect(part('prefix').textContent).toBe('onsli.de/ana/');
    expect(part('deckInput').value).toBe('mi-charla-web');
    submit('deck');
    await vi.waitFor(() => expect(visible()).toEqual(['deck', 'result']));
    expect(part('result').href).toBe('https://onsli.de/ana/mi-charla-web');
    expect(fake.files.get('decks/uid-ana/mi-charla-web.html').body).toBe('<h1>Hola</h1>');
  });

  it('un nombre ocupado o no válido se explica sin salir del paso', async () => {
    await fake.api.signInWithPopup();
    fake.docs.set('usernames/bea', { uid: 'otro' });
    await ui.open(DECK);
    part('usernameInput').value = 'bea';
    submit('username');
    await vi.waitFor(() => expect(part('status').value).toMatch(/ya lo tiene otra persona/));
    expect(visible()).toEqual(['username']);
  });
});
