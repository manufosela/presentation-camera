/**
 * Diálogo de publicar en onsli.de/<usuario>/<deck> (CAM-TSK-0175): según el
 * estado pide entrar con Google, reservar el nombre (una vez) o el del deck.
 */

import { t } from './i18n.js';
import { suggestDeckName } from './publishNames.js';
import { PublishError } from './publishStore.js';

const STEPS = ['signIn', 'username', 'deck', 'result'];

export function createPublishDialog({ dialog, loadPublisher }) {
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
      console.error('[publish]', error);
      say(error instanceof PublishError ? error.code : 'publish.failed');
    }
  }

  async function refresh() {
    if (!publisher.signedIn()) return show('signIn');
    const profile = await publisher.profile();
    if (!profile) return show('username');
    part('prefix').textContent = publisher.urlFor(profile.username, '').replace(/^https?:\/\//, '');
    show('deck');
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
      show('deck', 'result');
    });
  });

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
