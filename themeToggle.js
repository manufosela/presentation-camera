/**
 * Botón sol/luna del tema (CAM-TSK-0065). theme.js (cargado en el <head>)
 * decide y aplica el tema; aquí solo se ofrece el contrario y se alterna.
 */

const LABELS = {
  dark: { icon: '☀', label: 'Cambiar a tema claro' },
  light: { icon: '☾', label: 'Cambiar a tema oscuro' },
};

export function bindThemeToggle(button, theme = window.camTheme) {
  if (!theme) throw new Error('theme.js no está cargado: falta el <script src="theme.js"> en el <head>.');
  const render = () => {
    const { icon, label } = LABELS[theme.current()];
    button.textContent = icon;
    button.setAttribute('aria-label', label);
    button.title = label;
  };
  button.addEventListener('click', () => theme.toggle());
  theme.onChange(render); // también si cambia el tema del sistema
  render();
}
