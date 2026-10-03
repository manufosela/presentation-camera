/**
 * Atrapa el foco de teclado dentro de un diálogo modal (aria-modal="true"):
 * Tab y Shift+Tab ciclan entre sus elementos enfocables sin salir al fondo.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Gestiona un keydown dentro del diálogo; solo actúa con Tab. */
export function trapTabKey(container, event) {
  if (event.key !== 'Tab') return;
  const focusables = [...container.querySelectorAll(FOCUSABLE)];
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables.at(-1);
  const active = document.activeElement;
  if (!container.contains(active)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
