import { describe, expect, it, vi } from 'vitest';
import { AdminError } from './adminHandlers.js';
import { wrapHandler } from './callable.js';

class FakeHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

describe('wrapHandler — de handler a callable (CAM-TSK-0144)', () => {
  it('pasa el caller (o null) y los datos, y devuelve el resultado', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const call = wrapHandler(handler, { HttpsError: FakeHttpsError, logError: vi.fn() });
    expect(await call({ auth: { uid: 'u1' }, data: { a: 1 } })).toEqual({ ok: true });
    await call({ data: {} });
    expect(handler.mock.calls).toEqual([[{ uid: 'u1' }, { a: 1 }], [null, {}]]);
  });

  it('un AdminError sale con su código y su mensaje', async () => {
    const call = wrapHandler(async () => { throw new AdminError('not-found', 'No existe.'); }, { HttpsError: FakeHttpsError, logError: vi.fn() });
    await expect(call({ data: {} })).rejects.toMatchObject({ code: 'not-found', message: 'No existe.' });
  });

  it('cualquier otro error sale como interno sin detalles y queda en el log', async () => {
    const logError = vi.fn();
    const boom = new Error('secreto de la base de datos');
    const call = wrapHandler(async () => { throw boom; }, { HttpsError: FakeHttpsError, logError });
    await expect(call({ data: {} })).rejects.toMatchObject({ code: 'internal', message: 'Error interno.' });
    expect(logError).toHaveBeenCalledWith(boom);
  });
});
