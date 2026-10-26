/**
 * Plazo para una promesa que puede no resolverse nunca: sin red, Realtime
 * Database deja las escrituras en cola para siempre (CAM-TSK-0167, CAM-BUG-0027).
 */

export function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new DOMException(`sin respuesta en ${ms} ms`, 'TimeoutError')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
