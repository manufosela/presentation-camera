// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { bindUnloadGuard } from './unloadGuard.js';

const unload = target => {
  const event = new Event('beforeunload', { cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe('bindUnloadGuard — aviso al cerrar mientras se graba (CAM-TSK-0094)', () => {
  it('grabando: el navegador pide confirmación', () => {
    const target = new EventTarget();
    bindUnloadGuard(target, () => true);
    expect(unload(target).defaultPrevented).toBe(true);
  });

  it('sin grabar: se cierra sin preguntar', () => {
    const target = new EventTarget();
    bindUnloadGuard(target, () => false);
    expect(unload(target).defaultPrevented).toBe(false);
  });

  it('decide en el momento de cerrar, no al enlazarlo', () => {
    const target = new EventTarget();
    let recording = false;
    bindUnloadGuard(target, () => recording);
    recording = true;
    expect(unload(target).defaultPrevented).toBe(true);
  });
});
