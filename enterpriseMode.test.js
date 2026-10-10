// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEnterpriseMode } from './enterpriseMode.js';
import { setLang } from './i18n.js';

function mount() {
  document.body.innerHTML = `
    <section id="enterpriseSetup" hidden>
      <input id="enterpriseCode"><input id="enterpriseSpeaker"><input id="enterpriseTitle">
      <button id="enterpriseCheckBtn"></button><p id="enterpriseStatus"></p>
    </section>`;
  const $ = id => document.getElementById(id);
  return { section: $('enterpriseSetup'), code: $('enterpriseCode'), speaker: $('enterpriseSpeaker'), title: $('enterpriseTitle'), check: $('enterpriseCheckBtn'), status: $('enterpriseStatus') };
}

const memoryStorage = () => {
  const map = new Map();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
};
const type = (input, value) => { input.value = value; input.dispatchEvent(new Event('input')); };

beforeEach(() => setLang('es', null));

describe('createEnterpriseMode — grabar para una empresa (CAM-TSK-0106)', () => {
  it('sin enlace de empresa no muestra nada ni llama a nadie', () => {
    const ui = mount();
    const call = vi.fn();
    const mode = createEnterpriseMode({ elements: ui, link: null, call, storage: memoryStorage() });
    expect(ui.section.hidden).toBe(true);
    expect(mode.verified()).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  it('con enlace muestra el bloque con el código y, al comprobar, a dónde se sube', async () => {
    const ui = mount();
    const call = vi.fn(async () => ({ orgName: 'Acme', eventName: 'Congreso', expiresAtMs: 1 }));
    const mode = createEnterpriseMode({ elements: ui, link: { org: 'acme', code: 'ABCD' }, call, storage: memoryStorage() });
    expect([ui.section.hidden, ui.code.value]).toEqual([false, 'ABCD']);
    type(ui.speaker, ' Ana ');
    type(ui.title, 'Mi charla');
    expect(await mode.check()).toBe(true);
    expect(call).toHaveBeenCalledWith('describeCode', { org: 'acme', code: 'ABCD' });
    expect(ui.status.textContent).toBe('Se guardará en el Google Drive de Acme · Congreso');
    expect(mode.verified()).toEqual({ org: 'acme', code: 'ABCD', speaker: 'Ana', title: 'Mi charla', orgName: 'Acme', eventName: 'Congreso' });
  });

  it('pide nombre y código antes de comprobar', async () => {
    const ui = mount();
    const call = vi.fn();
    const mode = createEnterpriseMode({ elements: ui, link: { org: 'acme', code: null }, call, storage: memoryStorage() });
    expect(await mode.check()).toBe(false);
    expect(ui.status.textContent).toBe('Escribe el código del evento y tu nombre.');
    expect(call).not.toHaveBeenCalled();
  });

  it('un rechazo se enseña tal cual y no deja nada comprobado; cambiar un dato invalida lo comprobado', async () => {
    const ui = mount();
    const call = vi.fn(async () => { throw new Error('Este código ha caducado.'); });
    const mode = createEnterpriseMode({ elements: ui, link: { org: 'acme', code: 'ABCD' }, call, storage: memoryStorage() });
    type(ui.speaker, 'Ana');
    expect(await mode.check()).toBe(false);
    expect([ui.status.textContent, ui.status.classList.contains('error'), mode.verified()]).toEqual(['Este código ha caducado.', true, null]);
    call.mockResolvedValueOnce({ orgName: 'Acme', eventName: 'Congreso' });
    await mode.check();
    type(ui.title, 'Otra');
    expect(mode.verified()).toBeNull();
  });

  it('si se cambia un dato mientras se comprueba, la respuesta vieja no cuenta', async () => {
    const ui = mount();
    let answer;
    const call = vi.fn(() => new Promise(resolve => { answer = resolve; }));
    const mode = createEnterpriseMode({ elements: ui, link: { org: 'acme', code: 'ABCD' }, call, storage: memoryStorage() });
    type(ui.speaker, 'Ana');
    const checking = mode.check();
    type(ui.speaker, 'Luis');
    answer({ orgName: 'Acme', eventName: 'Congreso' });
    expect(await checking).toBe(false);
    expect(mode.verified()).toBeNull();
  });

  it('recuerda nombre y título en la sesión del navegador', () => {
    const storage = memoryStorage();
    const first = mount();
    createEnterpriseMode({ elements: first, link: { org: 'acme', code: 'ABCD' }, call: vi.fn(), storage });
    type(first.speaker, 'Ana');
    const again = mount();
    createEnterpriseMode({ elements: again, link: { org: 'acme', code: null }, call: vi.fn(), storage });
    expect(again.speaker.value).toBe('Ana');
  });
});
