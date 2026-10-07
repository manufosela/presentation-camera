/**
 * Cuenta atrás antes de grabar (CAM-TSK-0099): 3, 2, 1 sobre la presentación,
 * y se oculta (ya pintado) antes de que empiece la grabación, así que no sale
 * en el vídeo.
 */

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });
// Dos frames: el primero aplica el cambio, el segundo garantiza que ya se pintó.
const twoFrames = () => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });

export async function runCountdown(el, seconds, { wait = sleep, nextFrame = twoFrames } = {}) {
  el.hidden = false;
  for (let n = seconds; n > 0; n -= 1) {
    el.textContent = String(n);
    await wait(1000);
  }
  el.hidden = true;
  el.textContent = '';
  await nextFrame();
}
