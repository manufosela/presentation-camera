/**
 * Subtítulos en el setup (CAM-TSK-0120): guarda cada cambio y dice si el navegador
 * puede (si no, se desactiva). Si falta descargar idioma o traductor, el botón lo
 * descarga en el mismo clic: Chrome solo descarga tras un gesto del usuario.
 */

import { loadCaptionPrefs, saveCaptionPrefs } from './appPrefs.js';
import { t } from './i18n.js';

const MISSING = new Set(['unsupported', 'unavailable']);
const TO_DOWNLOAD = new Set(['downloadable', 'downloading']);

export function createCaptionsSetup({
  elements: { enabled, spoken, translateTo, prepare, status },
  storage,
  uiLang,
  recognizerSupport,
  translatorSupport,
  installLanguage,
  createTranslator,
  logger = console,
}) {
  const prefs = loadCaptionPrefs(storage, uiLang);
  enabled.checked = prefs.enabled;
  spoken.value = prefs.spoken;
  translateTo.value = prefs.translateTo ?? '';
  let last = { speech: null, translation: null };

  const read = () => ({ enabled: enabled.checked, spoken: spoken.value, translateTo: translateTo.value || null });
  const say = (key, params) => { status.textContent = t(key, params); };

  // Consulta fallida (p. ej. política de permisos) = no soportada, cada una por su lado.
  const safely = async query => {
    try {
      return await query();
    } catch (error) {
      logger.error(error);
      return 'unsupported';
    }
  };

  let refreshes = 0; // si se cambia la elección mientras se comprueba, solo vale la última
  async function refresh() {
    const { spoken: lang, translateTo: target } = read();
    const id = ++refreshes;
    const speech = await safely(() => recognizerSupport(lang));
    const translation = target ? await safely(() => translatorSupport(lang, target)) : null;
    if (id !== refreshes) return;
    last = { speech, translation };
    enabled.disabled = MISSING.has(speech);
    const needsDownload = TO_DOWNLOAD.has(speech) || TO_DOWNLOAD.has(translation);
    prepare.hidden = enabled.disabled || !needsDownload;
    if (enabled.disabled) say('captions.unsupported');
    else if (needsDownload) say('captions.needsDownload');
    else if (MISSING.has(translation)) say('captions.noTranslator');
    else say('captions.ready');
  }

  function save() {
    if (translateTo.value === spoken.value) translateTo.value = ''; // traducir al mismo idioma = no traducir
    saveCaptionPrefs(storage, read());
    return refresh();
  }

  async function prepareLanguages() {
    const { spoken: lang, translateTo: target } = read();
    prepare.disabled = true;
    say('captions.downloading', { pct: 0 });
    const onProgress = loaded => say('captions.downloading', { pct: Math.round(loaded * 100) });
    try { // las dos descargas se piden ya, dentro del gesto del clic
      await Promise.all([
        TO_DOWNLOAD.has(last.speech) && installLanguage(lang),
        target && TO_DOWNLOAD.has(last.translation) && createTranslator(lang, target, { onProgress }).then(model => model.destroy()),
      ]);
      await refresh();
    } catch (error) {
      logger.error(error);
      say('captions.prepareFailed');
    }
    prepare.disabled = false;
  }

  for (const control of [enabled, spoken, translateTo]) control.addEventListener('change', save);
  prepare.addEventListener('click', prepareLanguages);
  return { refresh, prepare: prepareLanguages, prefs: () => loadCaptionPrefs(storage, uiLang) };
}
