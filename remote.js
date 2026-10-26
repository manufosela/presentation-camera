/**
 * Mando desde el móvil (remote.html, CAM-TSK-0167). Lee el id de la sesión
 * del fragmento, se une por Realtime Database y envía los comandos de los
 * botones; muestra la mediana y el p95 de la ida y vuelta de cada comando.
 */

import './frameGuard.js';
import { joinRemote, loadRemoteDatabase } from './remoteChannel.js';
import { sessionIdFromHash } from './remoteSession.js';
import { latencySummary } from './latencyStats.js';
import { lockPortrait } from './remoteOrientation.js';
import { initI18n, onLangChange, t } from './i18n.js';

lockPortrait();

initI18n({ storage: globalThis.localStorage, languages: navigator.languages, button: document.getElementById('langBtn') });

const status = document.getElementById('remoteStatus');
const latency = document.getElementById('remoteLatency');
const buttons = [...document.querySelectorAll('[data-command]')];
const samples = [];

const setStatus = key => {
  status.dataset.i18n = key;
  status.textContent = t(key);
};
const renderLatency = () => {
  const summary = latencySummary(samples);
  latency.textContent = summary ? t('remote.latency', summary) : '';
};
onLangChange(renderLatency);

async function start(sessionId) {
  let remote;
  try {
    remote = await joinRemote({
      rtdb: await loadRemoteDatabase(),
      sessionId,
      onDesktop: online => setStatus(online ? 'remote.connected' : 'remote.desktopGone'),
      onAck: ({ roundTripMs }) => {
        samples.push(roundTripMs);
        renderLatency();
      },
    });
  } catch (error) {
    console.error('[remote] no se pudo unir a la sesión', error);
    setStatus('remote.failed');
    return;
  }
  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener('click', () => remote.send(button.dataset.command).catch(error => {
      console.error('[remote] comando no enviado', error);
      setStatus('remote.sendFailed');
    }));
  }
  globalThis.addEventListener('pagehide', () => remote.close());
}

const sessionId = sessionIdFromHash(location.hash);
if (sessionId) await start(sessionId);
else setStatus('remote.invalid');
