/**
 * Conectar el Google Drive de una empresa (ADR 0001 §3,
 * CAM-TSK-0145). start (callable) deja un state de un solo uso en
 * oauthStates/{state}; callback (HTTP, la URI de redirección) lo consume en una
 * transacción, canjea el código y guarda el refresh token cifrado (la carpeta
 * «onslide» se crea con la primera sesión de subida, así un fallo aquí no deja
 * nada en el Drive). Nada se guarda si algo falla, y una empresa ya conectada
 * no se reconecta sin desconectar antes (no quedan tokens sin revocar).
 */

import { AdminError, docId, requireOrgAdmin } from './adminHandlers.js';

const STATE_TTL_MS = 10 * 60_000;
const STATE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes en base64url

export function createDriveConnect({ db, google, seal, unseal, randomBytes, now, timestamp, panelUrl }) {
  const back = (outcome, reason) => {
    const url = new URL(panelUrl);
    url.searchParams.set('drive', outcome);
    if (reason) url.searchParams.set('reason', reason);
    return url.toString();
  };

  const revokeQuietly = token => google.revoke(token).catch(error => console.warn(error));

  async function start(caller, input) {
    const orgId = docId(input?.orgId, 'orgId');
    requireOrgAdmin(caller, orgId);
    const org = await db.doc(`orgs/${orgId}`).get();
    if (!org.exists) throw new AdminError('not-found', 'La empresa no existe.');
    if (org.data().drive?.connected) {
      throw new AdminError('failed-precondition', 'Ya hay un Drive conectado: desconéctalo antes.');
    }
    const state = randomBytes(32).toString('base64url');
    await db.doc(`oauthStates/${state}`).create({ orgId, uid: caller.uid, expiresAt: timestamp(now() + STATE_TTL_MS) });
    return { url: google.authUrl(state) };
  }

  /** Consume el state: si existe se borra siempre; solo vale si no ha caducado. */
  async function consumeState(state) {
    if (typeof state !== 'string' || !STATE.test(state)) return null;
    const ref = db.doc(`oauthStates/${state}`);
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return null;
      tx.delete(ref);
      const data = snapshot.data();
      return data.expiresAt.toMillis() > now() ? data : null;
    });
  }

  async function callback(query) {
    const pending = await consumeState(query.state);
    if (query.error) return back('error', 'denied');
    if (!pending || typeof query.code !== 'string') return back('error', 'state');
    let tokens = null;
    try {
      tokens = await google.exchangeCode(query.code);
      const connectedAt = timestamp(now());
      const orgRef = db.doc(`orgs/${pending.orgId}`);
      const saved = await db.runTransaction(async tx => { // las dos escrituras o ninguna
        if ((await tx.get(orgRef)).data().drive?.connected) return false; // otra conexión ganó
        tx.set(db.doc(`orgs/${pending.orgId}/private/drive`), {
          ...seal(tokens.refreshToken, pending.orgId), connectedBy: pending.uid, connectedAt,
        });
        tx.update(orgRef, { drive: { connected: true, email: tokens.email, connectedAt } });
        return true;
      });
      if (saved) return back('connected');
      await revokeQuietly(tokens.refreshToken);
      return back('error', 'already');
    } catch (error) {
      console.error(error);
      if (tokens) await revokeQuietly(tokens.refreshToken); // no dejar un acceso sin guardar
      return back('error', 'google');
    }
  }

  return { start, callback };
}
