/**
 * Tema claro/oscuro (CAM-TSK-0064). Script clásico cargado síncrono en el
 * <head>, antes de pintar, para que no haya parpadeo: fija
 * <html data-theme="light|dark">. Sin elección guardada sigue al sistema (y
 * a sus cambios); la elección del usuario se recuerda y prevalece.
 * La app y el panel usan window.camTheme.toggle() desde su botón.
 */
(() => {
  const STORAGE_KEY = 'cam.theme.v1'; // = STORAGE_KEYS.theme (theme.test.js lo comprueba)
  const THEMES = ['light', 'dark'];
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  // localStorage puede lanzar (modo privado): sin él, se sigue al sistema.
  const readChoice = () => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return THEMES.includes(stored) ? stored : null;
    } catch {
      return null;
    }
  };
  const saveChoice = theme => {
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* sin almacenamiento: no se recuerda */ }
  };

  let choice = readChoice();
  const listeners = [];
  const resolve = () => choice ?? (systemDark.matches ? 'dark' : 'light');
  const apply = () => {
    root.dataset.theme = resolve();
    listeners.forEach(listener => listener(root.dataset.theme));
  };

  apply();
  systemDark.addEventListener('change', apply);

  window.camTheme = {
    current: resolve,
    /** Avisa de cada cambio de tema (del usuario o del sistema). */
    onChange: listener => { listeners.push(listener); },
    toggle() {
      choice = resolve() === 'dark' ? 'light' : 'dark';
      saveChoice(choice);
      apply();
      return choice;
    },
  };
})();
