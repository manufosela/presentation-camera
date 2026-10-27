/**
 * Diálogo de publicar en onsli.de/<usuario>/<deck> (CAM-TSK-0175): según el
 * estado pide entrar con Google, reservar el nombre (una vez) o el del deck.
 * Debajo, los decks ya publicados, con su botón de despublicar (CAM-TSK-0183).
 */

import { t } from './i18n.js';
import { suggestDeckName } from './publishNames.js';
import { PublishError } from './publishStore.js';

const STEPS = ['signIn', 'username', 'deck', 'result', 'copy', 'list'];
// Cerrar el popup de Google es cambiar de idea, no un fallo.
const CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

export function createPublishDialog({ dialog, loadPublisher, copyText = text => navigator.clipboard.writeText(text) }) {
  const part = name => dialog.querySelector(`[data-publish="${name}"]`);
  const link = part('result');
  let publisher = null;
  let html = '';

  const show = (...steps) => STEPS.forEach(step => { part(step).hidden = !steps.includes(step); });
  const say = key => { part('status').value = key ? t(key) : ''; };

  async function guard(action) {
    say(null);
    try {
      await action();
    } catch (error) {
      if (CANCELLED.has(error.code)) return;
      console.error('[publish]', error);
      say(error instanceof PublishError ? error.code : 'publish.failed');
    }
  }

  async function refresh() {
    if (!publisher.signedIn()) return show('signIn');
    const profile = await publisher.profile();
    if (!profile) return show('username');
    part('prefix').textContent = publisher.urlFor(profile.username, '').replace(/^https?:\/\//, '');
    part('list').replaceChildren(...profile.decks.map(deck => publishedItem(profile.username, deck)));
    show('deck', 'list');
  }

  function publishedItem(username, deck) {
    const item = document.createElement('li');
    const open = Object.assign(document.createElement('a'), { href: publisher.urlFor(username, deck), textContent: deck, target: '_blank', rel: 'noopener' });
    const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'row-btn', textContent: t('publishUi.unpublish') });
    remove.addEventListener('click', () => guard(async () => {
      await publisher.unpublish(deck);
      await refresh();
    }));
    item.append(open, remove);
    return item;
  }

  part('signIn').querySelector('button').addEventListener('click', () => guard(async () => {
    await publisher.signIn();
    await refresh();
  }));

  part('username').addEventListener('submit', event => {
    event.preventDefault();
    guard(async () => {
      await publisher.reserveUsername(part('usernameInput').value.trim());
      await refresh();
    });
  });

  part('deck').addEventListener('submit', event => {
    event.preventDefault();
    guard(async () => {
      const url = await publisher.publish({ deck: part('deckInput').value.trim(), html });
      link.href = url;
      link.textContent = url;
      await refresh();
      show('deck', 'list', 'result', 'copy');
    });
  });

  part('copy').addEventListener('click', () => guard(async () => {
    await copyText(link.href);
    say('publishUi.copied');
  }));

  return {
    async open({ title, html: deckHtml }) {
      html = deckHtml;
      part('deckInput').value = suggestDeckName(title);
      show();
      say(null);
      dialog.showModal();
      await guard(async () => {
        publisher ??= await loadPublisher();
        await publisher.ready();
        await refresh();
      });
    },
  };
}
