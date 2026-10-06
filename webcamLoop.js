/**
 * Motor de dibujado del overlay de cámara, con dependencias inyectadas para
 * poder testearlo sin DOM real. La UI (permisos, select de cámara, avisos)
 * vive en precam.js.
 */

import { createPresenceTracker, personCoverage } from './presence.js';

/**
 * Ciclo de requestAnimationFrame: llama a `step()` en cada frame mientras
 * devuelva true. `start()` con el bucle en marcha no crea un segundo bucle.
 */
export function createFrameLoop({ step, requestFrame, cancelFrame }) {
  let frameId = null;
  let running = false;
  const tick = () => {
    frameId = null;
    if (!running) return;
    if (step()) frameId = requestFrame(tick);
    else running = false;
  };
  return {
    start() {
      if (running) return;
      running = true;
      tick();
    },
    stop() {
      running = false;
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
    },
    isRunning: () => running,
  };
}

/**
 * Parte de la imagen (srcW×srcH) que cubre un recuadro dstW×dstH sin
 * deformarse, centrada (como object-fit: cover).
 */
export function coverRect(srcW, srcH, dstW, dstH) {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const sw = dstW / scale;
  const sh = dstH / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

/**
 * Un frame del modo recorte: ajusta el canvas al vídeo, lanza la segmentación
 * cada `intervalMs` sin solaparlas y compone la persona con la máscara; si no
 * se detecta a nadie, dibuja la cámara completa.
 * `segment(video)` resuelve { data, mask }: data son 0/1 por píxel y mask el
 * ImageData opaco donde hay persona.
 */
export function createCutoutRenderer({
  video, canvas, segment, now, intervalMs = 50, getBackground = () => null, isMirrored = () => true,
}) {
  let ctx = null;
  let lastMask = null;
  let lastSegmentationAt = -Infinity;
  let inFlight = false;
  let presence = createPresenceTracker();
  // Cada reset (cambio de cámara) abre una generación nueva: los resultados de
  // una segmentación lanzada antes se descartan y no bloquean a la siguiente.
  let generation = 0;

  const refreshMask = async () => {
    const mine = generation;
    inFlight = true;
    try {
      const { data, mask } = await segment(video);
      if (mine !== generation) return;
      presence.update(personCoverage(data), now());
      lastMask = mask;
      lastSegmentationAt = now();
    } finally {
      if (mine === generation) inFlight = false;
    }
  };

  return {
    drawFrame() {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx = null; // contexto invalidado al redimensionar
        lastMask = null;
      }
      ctx ??= canvas.getContext('2d'); // sin willReadFrequently: nunca se leen píxeles
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!inFlight && (!lastMask || now() - lastSegmentationAt >= intervalMs)) {
        refreshMask().catch(error => console.warn('Segmentación fallida', error));
      }
      if (!presence.isPresent()) {
        // Nadie detectado: cámara completa (con aviso) en vez de un overlay vacío.
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } else if (lastMask) {
        ctx.putImageData(lastMask, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Fondo elegido (CAM-TSK-0059): detrás de la persona, cubriendo el recuadro.
        // Con espejo (CSS scaleX(-1)) el fondo se pinta volteado para que se
        // lea al derecho en pantalla y en la grabación.
        const background = getBackground();
        if (background) {
          const { sx, sy, sw, sh } = coverRect(background.width, background.height, canvas.width, canvas.height);
          ctx.save();
          if (isMirrored()) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.globalCompositeOperation = 'destination-over';
          ctx.drawImage(background, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    },
    isPersonPresent: () => presence.isPresent(),
    /** Nueva cámara: sin arrastrar la máscara ni la ausencia anteriores. */
    reset() {
      generation += 1;
      inFlight = false;
      presence = createPresenceTracker();
      lastMask = null;
      lastSegmentationAt = -Infinity;
    },
  };
}
