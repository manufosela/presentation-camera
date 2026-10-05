/**
 * Botón sol/luna del tema (CAM-TSK-0065). theme.js (cargado en el <head>)
 * decide y aplica el tema; aquí solo se ofrece el contrario y se alterna.
 */

import { onLangChange, t } from './i18n.js';

const LABELS = {
  dark: { icon: '☀', labelKey: 'theme.toLight' },
  light: { icon: '☾', labelKey: 'theme.toDark' },
};

export function bindThemeToggle(button, theme = window.camTheme) {
  if (!theme) throw new Error('theme.js no está cargado: falta el <script src="theme.js"> en el <head>.');
  const render = () => {
    const { icon, labelKey } = LABELS[theme.current()];
    const label = t(labelKey);
    button.textContent = icon;
    button.setAttribute('aria-label', label);
    button.title = label;
  };
  button.addEventListener('click', () => theme.toggle());
  theme.onChange(render); // también si cambia el tema del sistema
  onLangChange(render);
  render();
}
