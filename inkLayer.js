/**
 * Capa de tinta sobre la diapositiva (CAM-TSK-0112): un canvas a pantalla completa
 * encima del deck (sale en la grabación) con modos 'off', 'laser' (punto con estela;
 * solo pide frames mientras se desvanece) y 'draw' (trazos que se borran al salir).
 */

export const LASER_TRAIL_MS = 400;
const MODES = new Set(['off', 'laser', 'draw']);
const LASER_COLOR = '255 45 45';
const DOT_RADIUS = 7;
const PEN = { color: 'rgb(255 214 0)', width: 4 };

/** Los puntos de la estela que aún no se han desvanecido. */
export const trailAt = (points, now, maxAgeMs = LASER_TRAIL_MS) => points.filter(point => now - point.t <= maxAgeMs);

export function createInkLayer({
  canvas,
  now = () => performance.now(),
  requestFrame = callback => requestAnimationFrame(callback),
  pixelRatio = () => window.devicePixelRatio || 1,
}) {
  const ctx = canvas.getContext('2d');
  let mode = 'off';
  let trail = [];
  let pointer = null; // última posición, para el punto del láser
  let strokes = [];
  let currentStroke = null;
  let frame = null;

  const schedule = () => { frame ??= requestFrame(render); };

  function render() {
    frame = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PEN.color;
    ctx.lineWidth = PEN.width;
    for (const stroke of strokes) {
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (const point of stroke.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    if (mode !== 'laser' || !pointer) return;
    const time = now();
    trail = trailAt(trail, time);
    for (let i = 1; i < trail.length; i += 1) {
      const fade = 1 - (time - trail[i].t) / LASER_TRAIL_MS;
      ctx.strokeStyle = `rgb(${LASER_COLOR} / ${(fade * 0.8).toFixed(2)})`;
      ctx.lineWidth = DOT_RADIUS * fade + 1;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    ctx.fillStyle = `rgb(${LASER_COLOR})`;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    if (trail.length) schedule(); // la estela sigue desvaneciéndose
  }

  return {
    mode: () => mode,
    setMode(next) {
      if (!MODES.has(next)) throw new Error(`modo de tinta desconocido: ${next}`);
      if (next !== 'draw') strokes = [];
      mode = next;
      trail = [];
      pointer = null;
      currentStroke = null;
      schedule();
    },
    /** Tamaño en píxeles CSS; el canvas se ajusta a la densidad de la pantalla. */
    resize(width, height) {
      const ratio = pixelRatio();
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      schedule();
    },
    pointerDown(x, y) {
      if (mode !== 'draw') return;
      currentStroke = [{ x, y }];
      strokes.push(currentStroke);
    },
    pointerMove(x, y) {
      if (mode === 'laser') {
        pointer = { x, y };
        trail.push({ x, y, t: now() });
      } else if (mode === 'draw' && currentStroke) {
        currentStroke.push({ x, y });
      } else {
        return;
      }
      schedule();
    },
    pointerUp() { currentStroke = null; },
    clear() {
      strokes = [];
      currentStroke = null;
      schedule();
    },
  };
}
