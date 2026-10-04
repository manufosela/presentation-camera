/**
 * Peticiones de cámara donde solo la última gana (CAM-BUG-0008).
 *
 * getUserMedia puede tardar; si el usuario cambia de cámara dos veces seguidas
 * o vuelve al setup mientras tanto, una respuesta antigua llegaría tarde y
 * sustituiría a la buena o dejaría la cámara encendida. Cada `acquire()` abre
 * una generación nueva: lo que llega de una generación pasada se libera
 * (`release`) y se entrega como null, y el stream ya entregado también se
 * libera al sustituirlo o al cancelar.
 */
export function createStreamSwitcher({ request, release }) {
  let generation = 0;
  let current = null;

  // El stream entregado deja de valer: se libera aquí, no depende de quien lo usa.
  const retireCurrent = () => {
    if (current) release(current);
    current = null;
  };

  return {
    async acquire() {
      const mine = ++generation;
      retireCurrent();
      let stream;
      try {
        stream = await request();
      } catch (error) {
        if (mine !== generation) return null; // fallo de una petición ya sustituida
        throw error;
      }
      if (mine !== generation) {
        release(stream);
        return null;
      }
      current = stream;
      return stream;
    },
    /** Invalida la petición en curso (p. ej. al volver al setup). */
    cancel() {
      generation += 1;
      retireCurrent();
    },
    /** true si `stream` es el último entregado y nada lo ha sustituido. */
    isCurrent: stream => stream !== null && stream === current,
  };
}
