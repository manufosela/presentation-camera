// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCaptionsSetup } from './captionsSetup.js';
import { loadCaptionPrefs } from './appPrefs.js';
import { setLang } from './i18n.js';

const memoryStorage = (map = new Map()) => ({ getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) });

function mount() {
  document.body.innerHTML = `
    <input type="checkbox" id="enabled">
    <select id="spoken"><option value="es">es</option><option value="en">en</option></select>
    <select id="translate"><option value="">no</option><option value="es">es</option><option value="en">en</option></select>
    <button id="prepare" hidden></button>
    <p id="status"></p>`;
  const $ = id => document.getElementById(id);
  return { enabled: $('enabled'), spoken: $('spoken'), translateTo: $('translate'), prepare: $('prepare'), status: $('status') };
}

function setup({ recognizer = 'available', translator = 'available', storage = memoryStorage() } = {}) {
  const elements = mount();
  const deps = {
    recognizerSupport: vi.fn(async () => recognizer),
    translatorSupport: vi.fn(async () => translator),
    installLanguage: vi.fn(async () => {}),
    createTranslator: vi.fn(async (from, to, { onProgress }) => { onProgress(0.5); onProgress(1); return { destroy: vi.fn() }; }),
  };
  const controller = createCaptionsSetup({ elements, storage, uiLang: 'es', ...deps });
  return { elements, storage, deps, controller };
}

const change = element => element.dispatchEvent(new Event('change'));
beforeEach(() => setLang('es', null));
describe('createCaptionsSetup — subtítulos en el setup (CAM-TSK-0120)', () => {
  it('pinta las preferencias guardadas, dice que está listo y guarda cada cambio', async () => {
    const { elements, storage, controller } = setup();
    await controller.refresh();
    expect([elements.enabled.checked, elements.spoken.value, elements.translateTo.value]).toEqual([false, 'es', '']);
    expect(elements.status.textContent).toMatch(/listos/i);
    expect(elements.prepare.hidden).toBe(true);
    elements.enabled.checked = true;
    change(elements.enabled);
    elements.translateTo.value = 'en';
    change(elements.translateTo);
    expect(loadCaptionPrefs(storage, 'es')).toEqual({ enabled: true, spoken: 'es', translateTo: 'en' });
  });

  it('si el navegador no puede, lo indica y lo desactiva', async () => {
    const { elements, controller } = setup({ recognizer: 'unsupported' });
    await controller.refresh();
    expect(elements.enabled.disabled).toBe(true);
    expect(elements.status.textContent).toMatch(/Chrome/);
  });

  it('si hay que descargar el idioma, el botón lo descarga (con el traductor si hace falta) y queda listo', async () => {
    const { elements, deps, controller } = setup({ recognizer: 'downloadable', translator: 'downloadable' });
    elements.translateTo.value = 'en';
    change(elements.translateTo);
    await controller.refresh();
    expect(elements.prepare.hidden).toBe(false);
    deps.recognizerSupport.mockResolvedValue('available');
    deps.translatorSupport.mockResolvedValue('available');
    await controller.prepare();
    expect(deps.installLanguage).toHaveBeenCalledWith('es');
    expect(deps.createTranslator).toHaveBeenCalledWith('es', 'en', expect.any(Object));
    expect(elements.status.textContent).toMatch(/listos/i);
  });

  it('sin traductor integrado avisa de que se subtitula sin traducir', async () => {
    const { elements, controller } = setup({ translator: 'unsupported' });
    elements.translateTo.value = 'en';
    change(elements.translateTo);
    await controller.refresh();
    expect(elements.status.textContent).toMatch(/sin traducir/i);
  });

  it('una consulta que falla cuenta como no soportada; si es la del traductor, se subtitula sin traducir', async () => {
    const { elements, deps, controller } = setup();
    elements.translateTo.value = 'en';
    change(elements.translateTo);
    deps.translatorSupport.mockRejectedValue(new Error('bloqueado'));
    await controller.refresh();
    expect([elements.enabled.disabled, elements.status.textContent]).toEqual([false, expect.stringMatching(/sin traducir/i)]);
    deps.recognizerSupport.mockRejectedValueOnce(new Error('bloqueado'));
    await controller.refresh();
    expect(elements.enabled.disabled).toBe(true);
  });

  it('si la elección cambia mientras se comprueba, una respuesta vieja no pisa la nueva', async () => {
    const { elements, deps, controller } = setup();
    let answerOld;
    deps.recognizerSupport.mockImplementationOnce(() => new Promise(resolve => { answerOld = resolve; }));
    const old = controller.refresh();
    await controller.refresh();
    answerOld('unsupported');
    await old;
    expect([elements.enabled.disabled, elements.status.textContent]).toEqual([false, expect.stringMatching(/listos/i)]);
  });

  it('si la descarga falla, lo dice', async () => {
    const { elements, deps, controller } = setup({ recognizer: 'downloadable' });
    deps.installLanguage.mockRejectedValueOnce(new Error('sin red'));
    await controller.refresh();
    await controller.prepare();
    expect(elements.status.textContent).toMatch(/No se pudo/);
  });
});
