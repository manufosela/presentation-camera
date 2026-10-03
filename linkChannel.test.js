import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceIndexForKey, startMainLink, startPanelLink } from './linkChannel.js';

// BroadcastChannel falso: dos extremos conectados (lo que envía uno lo recibe el otro).
function channelPair() {
  const make = () => ({ listeners: [], sent: [], peer: null,
    addEventListener(type, fn) { if (type === 'message') this.listeners.push(fn); },
    removeEventListener(type, fn) { this.listeners = this.listeners.filter(l => l !== fn); },
    postMessage(data) { this.sent.push(data); this.peer?.listeners.forEach(fn => fn({ data })); },
  });
  const a = make();
  const b = make();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: null, ...extra });

describe('sourceIndexForKey — atajo 1-9 para cambiar de fuente', () => {
  it('1..9 → índice 0..8 si existe', () => {
    expect(sourceIndexForKey(key('1'), 3)).toBe(0);
    expect(sourceIndexForKey(key('3'), 3)).toBe(2);
  });

  it('fuera de rango, 0, letras o con modificadores → null', () => {
    expect(sourceIndexForKey(key('4'), 3)).toBeNull();
    expect(sourceIndexForKey(key('0'), 3)).toBeNull();
    expect(sourceIndexForKey(key('a'), 3)).toBeNull();
    expect(sourceIndexForKey(key('1', { ctrlKey: true }), 3)).toBeNull();
  });

  it('escribiendo en un campo → null', () => {
    const target = { closest: () => ({}) };
    expect(sourceIndexForKey(key('1', { target }), 3)).toBeNull();
  });
});

describe('protocolo de enlace ventana principal ↔ panel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('panel abierto después de la principal: hello → ack → enlazados', () => {
    const [mainCh, panelCh] = channelPair();
    const main = startMainLink(mainCh);
    const states = [];
    startPanelLink(panelCh, state => states.push(state));
    expect(main.isLinked()).toBe(true);
    expect(states.at(-1)).toBe('linked');
  });

  it('principal abierta después del panel: su hello también enlaza', () => {
    const [mainCh, panelCh] = channelPair();
    const states = [];
    startPanelLink(panelCh, state => states.push(state));
    const main = startMainLink(mainCh);
    expect(main.isLinked()).toBe(true);
    expect(states.at(-1)).toBe('linked');
  });

  it('sin principal: el panel marca lost a los 8 s', () => {
    const [, panelCh] = channelPair();
    const states = [];
    startPanelLink(panelCh, state => states.push(state));
    vi.advanceTimersByTime(8000);
    expect(states.at(-1)).toBe('lost');
  });

  it('la principal deja de latir: el panel marca lost a los 12 s', () => {
    const [mainCh, panelCh] = channelPair();
    const main = startMainLink(mainCh);
    const states = [];
    startPanelLink(panelCh, state => states.push(state));
    main.dispose(); // la principal se cierra sin despedirse
    vi.advanceTimersByTime(12000);
    expect(states.at(-1)).toBe('lost');
  });

  it('con latidos periódicos el enlace se mantiene', () => {
    const [mainCh, panelCh] = channelPair();
    startMainLink(mainCh);
    const states = [];
    startPanelLink(panelCh, state => states.push(state));
    vi.advanceTimersByTime(60000);
    expect(states.at(-1)).toBe('linked');
  });

  it('bye de la principal: el panel marca lost al instante, sin esperar al vigilante', () => {
    const [mainCh, panelCh] = channelPair();
    const main = startMainLink(mainCh);
    const states = [];
    const panel = startPanelLink(panelCh, state => states.push(state));
    main.bye();
    main.dispose(); // la ventana principal se ha cerrado
    expect(states.at(-1)).toBe('lost');
    expect(panel.isLinked()).toBe(false);
    vi.advanceTimersByTime(12000);
    expect(states.filter(s => s === 'lost')).toHaveLength(1); // el vigilante ya no vuelve a disparar
  });

  it('bye del panel: la principal deja de considerarlo enlazado', () => {
    const [mainCh, panelCh] = channelPair();
    const main = startMainLink(mainCh);
    const panel = startPanelLink(panelCh, () => {});
    panel.bye();
    expect(main.isLinked()).toBe(false);
  });

  it('la principal solo late mientras hay panel', () => {
    const [mainCh] = channelPair();
    startMainLink(mainCh);
    vi.advanceTimersByTime(20000);
    expect(mainCh.sent.filter(m => m.type === 'main:heartbeat')).toHaveLength(0);
  });
});
