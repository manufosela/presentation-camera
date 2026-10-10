/**
 * Diálogo de recorte al parar la grabación (CAM-TSK-0128): vista previa del
 * vídeo y dos controles, inicio y fin. Mover uno lleva la vista previa a ese
 * punto. Devuelve { startSec, endSec } si se pidió descargar con el rango
 * cambiado; { discard: true } si se descartó tras confirmarlo dos veces; null
 * (entero) si no se tocó, si se eligió «entero» o si se cerró con Esc: cerrar
 * nunca hace perder la grabación.
 */

const MIN_GAP_SEC = 1;
const pad = value => String(value).padStart(2, '0');

/** 75 → "1:15"; 3725 → "1:02:05". */
export function formatClock(seconds) {
  const total = Math.floor(seconds);
  const [hours, minutes, secs] = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60];
  return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/**
 * Descartar (CAM-TSK-0139): dos confirmaciones dentro del propio diálogo, con el
 * foco en «no» en cada paso; cancelar vuelve a las opciones. Solo la segunda
 * confirmación cierra con 'discard'.
 */
function confirmDiscard(dialog, signal) {
  const [actions, confirm, discard, yes, no] = ['.trim-actions', '.trim-confirm', '.trim-discard', '.trim-confirm-yes', '.trim-confirm-no']
    .map(selector => dialog.querySelector(selector));
  let step = 0;
  const show = next => {
    step = next;
    actions.hidden = step > 0;
    confirm.hidden = step === 0;
    for (const text of confirm.querySelectorAll('[data-step]')) text.hidden = Number(text.dataset.step) !== step;
    if (step > 0) no.focus();
  };
  show(0);
  discard.addEventListener('click', () => show(1), { signal });
  no.addEventListener('click', () => show(0), { signal });
  yes.addEventListener('click', () => (step === 1 ? show(2) : dialog.close('discard')), { signal });
}

export function openTrimDialog({
  dialog,
  blob,
  durationSec,
  createUrl = b => URL.createObjectURL(b),
  revokeUrl = url => URL.revokeObjectURL(url),
}) {
  const video = dialog.querySelector('.trim-video');
  const [start, end, startTime, endTime] = ['trimStart', 'trimEnd', 'trimStartTime', 'trimEndTime'].map(id => dialog.querySelector(`#${id}`));
  const url = createUrl(blob);
  video.src = url;
  for (const input of [start, end]) Object.assign(input, { min: '0', max: String(durationSec), step: '0.1' });
  start.value = '0';
  end.value = String(durationSec);
  const render = () => {
    startTime.value = formatClock(Number(start.value));
    endTime.value = formatClock(Number(end.value));
  };
  render();

  const listeners = new AbortController();
  const follow = (input, clamp) => input.addEventListener('input', () => {
    input.value = String(clamp(Number(input.value)));
    video.currentTime = Number(input.value);
    render();
  }, { signal: listeners.signal });
  const gap = Math.min(MIN_GAP_SEC, durationSec / 2); // grabaciones muy cortas: hueco menor
  follow(start, value => Math.max(0, Math.min(value, Number(end.value) - gap)));
  follow(end, value => Math.min(durationSec, Math.max(value, Number(start.value) + gap)));
  confirmDiscard(dialog, listeners.signal);

  return new Promise(resolve => {
    dialog.addEventListener('close', () => {
      listeners.abort();
      video.removeAttribute('src');
      video.load?.();
      revokeUrl(url);
      if (dialog.returnValue === 'discard') return resolve({ discard: true });
      const range = { startSec: Number(start.value), endSec: Number(end.value) };
      const isWhole = range.startSec <= 0 && range.endSec >= durationSec;
      resolve(dialog.returnValue === 'trim' && !isWhole ? range : null);
    }, { once: true });
    dialog.returnValue = '';
    dialog.showModal();
  });
}
