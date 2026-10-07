/**
 * La diapositiva real en la vista previa del setup (CAM-TSK-0088).
 *
 * Un único iframe con la presentación activa, aislado igual que en directo
 * (frameSandbox.js) y sin permisos extra. Va dentro de un contenedor inerte:
 * se ve, pero no recibe foco ni clics. Sus mensajes no llegan a la lógica del
 * directo, que solo escucha al iframe activo de la presentación.
 */

import { sandboxForSource } from './frameSandbox.js';

export function createSetupPreview({ host, appOrigin, resolveSrc, titleFor }) {
  let current = null; // { key, frame }
  let request = 0;

  const keyOf = source => `${source.id}|${source.url ?? source.localRef}`;

  function clear() {
    request += 1; // lo que estuviera resolviéndose ya no aplica
    current?.frame.remove();
    current = null;
  }

  async function show(source) {
    if (!source) {
      clear();
      return;
    }
    if (current?.key === keyOf(source)) return;
    clear();
    const ticket = request;
    const src = await resolveSrc(source);
    if (ticket !== request || !src) return; // otra petición más reciente manda
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', sandboxForSource(source, appOrigin));
    frame.title = titleFor(source);
    frame.tabIndex = -1;
    frame.src = src;
    host.append(frame);
    current = { key: keyOf(source), frame };
  }

  return { show, clear };
}
