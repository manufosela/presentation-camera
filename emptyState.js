/**
 * Primera visita sin presentaciones (CAM-TSK-0085): en vez de un modal, la
 * vista previa invita a elegir una y el botón de empezar espera desactivado.
 * El CSS reacciona a la clase `is-empty` del setup.
 */
export function applyEmptyState({ setup, startButton, startHint }, isEmpty) {
  setup.classList.toggle('is-empty', isEmpty);
  startButton.disabled = isEmpty;
  startHint.hidden = !isEmpty;
}
