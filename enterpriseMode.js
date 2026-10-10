/**
 * Grabar para una empresa (CAM-TSK-0106): con un enlace ?org=… el setup
 * enseña un bloque con el código del evento, el nombre del ponente y el título.
 * «Comprobar» pregunta a describeCode, sin gastar el código, a qué empresa y
 * evento irá la grabación y lo dice claro antes de grabar. Sin enlace de
 * empresa no aparece nada ni se llama a Firebase.
 */

import { STORAGE_KEYS } from './constants.js';
import { t } from './i18n.js';

function remembered(storage) {
  try {
    return JSON.parse(storage.getItem(STORAGE_KEYS.enterprise) ?? '{}');
  } catch {
    return {};
  }
}

export function createEnterpriseMode({ elements: { section, code, speaker, title, check, status }, link, call, storage }) {
  let verified = null;
  let generation = 0; // un cambio o una comprobación nueva invalidan la respuesta en curso
  if (!link) return { check: async () => false, verified: () => null };

  section.hidden = false;
  const saved = remembered(storage);
  code.value = link.code ?? saved.code ?? '';
  speaker.value = saved.speaker ?? '';
  title.value = saved.title ?? '';

  const say = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('error', isError);
  };
  const values = () => ({ code: code.value.trim(), speaker: speaker.value.trim(), title: title.value.trim() });

  // Cualquier cambio invalida lo comprobado y se recuerda para esta sesión del navegador.
  for (const input of [code, speaker, title]) {
    input.addEventListener('input', () => {
      generation += 1;
      verified = null;
      say('');
      try { storage.setItem(STORAGE_KEYS.enterprise, JSON.stringify(values())); } catch { /* sin almacenamiento */ }
    });
  }

  async function runCheck() {
    const current = values();
    if (!current.code || !current.speaker) {
      say(t('enterprise.missing'), true);
      return false;
    }
    const mine = ++generation;
    say(t('enterprise.checking'));
    try {
      const { orgName, eventName } = await call('describeCode', { org: link.org, code: current.code });
      if (mine !== generation) return false; // los datos cambiaron mientras se comprobaba
      verified = { org: link.org, ...current, orgName, eventName };
      say(t('enterprise.destination', { org: orgName, event: eventName }));
      return true;
    } catch (error) {
      if (mine !== generation) return false;
      verified = null;
      say(error.message, true);
      return false;
    }
  }

  check.addEventListener('click', runCheck);
  return { check: runCheck, verified: () => verified };
}
