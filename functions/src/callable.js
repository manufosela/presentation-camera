/**
 * De handler a callable (CAM-TSK-0144): el caller es request.auth (o null); un
 * AdminError sale con su código y su mensaje; cualquier otro error, como
 * «internal» sin detalles para el cliente y completo en el log.
 */

import { AdminError } from './adminHandlers.js';

export function wrapHandler(handler, { HttpsError, logError }) {
  return async request => {
    try {
      return await handler(request.auth ?? null, request.data);
    } catch (error) {
      if (error instanceof AdminError) throw new HttpsError(error.code, error.message);
      logError(error);
      throw new HttpsError('internal', 'Error interno.');
    }
  };
}
