/**
 * Sesiones de subida con un código de evento (ADR 0001 §5, CAM-TSK-0152). El
 * ponente no tiene sesión: el código es la autorización. En una transacción se
 * comprueban el código y el cupo diario de la empresa y se cuentan (si algo
 * falla, nada); después el servidor refresca el token, crea la carpeta
 * «AAAA-MM-DD Ponente» dentro del evento y abre la subida resumable con el
 * Origin de onslide. El navegador recibe solo la URI de esa sesión.
 */

import { AdminError } from './adminHandlers.js';
import { hashEventCode, reserveCodeUse } from './eventCodes.js';
import { GoogleApiError } from './googleClient.js';
import { uploadNames } from './uploadNames.js';

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const MAX_BYTES = 20 * 1024 ** 3;
const REJECTED = {
  unknown: 'Código no válido.',
  revoked: 'Este código se ha revocado.',
  expired: 'Este código ha caducado.',
  exhausted: 'Este código ya no admite más grabaciones.',
};

function validate(input) {
  if (typeof input?.org !== 'string' || !SLUG.test(input.org)) throw new AdminError('invalid-argument', 'Empresa no válida.');
  if (typeof input.speaker !== 'string' || !input.speaker.trim()) throw new AdminError('invalid-argument', 'Falta el nombre del ponente.');
  if (input.size !== undefined && (!Number.isInteger(input.size) || input.size < 1 || input.size > MAX_BYTES)) {
    throw new AdminError('invalid-argument', 'Tamaño no válido.');
  }
  try {
    return hashEventCode(input.code);
  } catch {
    throw new AdminError('invalid-argument', 'Código no válido.');
  }
}

export function createUploadSessions({ db, google, unseal, ensureFolder, now, timestamp, newId, origin }) {
  async function requireData(path, error) {
    const snapshot = await db.doc(path).get();
    if (!snapshot.exists) throw error;
    return snapshot.data();
  }

  const usageRefFor = orgId => db.doc(`usage/${orgId}_${new Date(now()).toISOString().slice(0, 10).replaceAll('-', '')}`);

  /** Devuelve lo reservado si la sesión no llega a abrirse (no gastar cupo en fallos). */
  function release(orgId, codeHash, usageRef) {
    const codeRef = db.doc(`orgs/${orgId}/codes/${codeHash}`);
    return db.runTransaction(async tx => {
      const codeDoc = (await tx.get(codeRef)).data();
      const used = (await tx.get(usageRef)).data()?.sessions ?? 0;
      if (codeDoc?.uploads > 0) tx.update(codeRef, { uploads: codeDoc.uploads - 1 });
      if (used > 0) tx.set(usageRef, { sessions: used - 1 });
    });
  }

  /** Comprueba y cuenta código y cupo diario a la vez; devuelve el evento. */
  function reserve(orgId, org, codeHash, usageRef) {
    return db.runTransaction(async tx => {
      const used = (await tx.get(usageRef)).data()?.sessions ?? 0; // lecturas antes que escrituras
      const verdict = await reserveCodeUse(tx, db.doc(`orgs/${orgId}/codes/${codeHash}`), now());
      if (!verdict.ok) throw new AdminError('permission-denied', REJECTED[verdict.reason]);
      if (used >= org.limits.sessionsPerDay) throw new AdminError('resource-exhausted', 'La empresa ha llegado al tope de grabaciones de hoy.');
      tx.set(usageRef, { sessions: used + 1 });
      return verdict.eventId;
    });
  }

  async function accessTokenFor(orgId) {
    const sealed = await requireData(`orgs/${orgId}/private/drive`, new AdminError('failed-precondition', 'La empresa no tiene Drive conectado.'));
    try {
      return await google.refreshAccessToken(unseal(sealed, orgId));
    } catch (error) {
      if (error instanceof GoogleApiError && error.status === 400) {
        throw new AdminError('failed-precondition', 'El Drive de la empresa se ha desconectado.');
      }
      throw error;
    }
  }

  async function createSession(_caller, input) {
    const codeHash = validate(input);
    const names = uploadNames({ speaker: input.speaker, title: input.title, mimeType: input.mimeType, nowMs: now() });
    const { orgId } = await requireData(`orgSlugs/${input.org}`, new AdminError('not-found', 'Empresa no encontrada.'));
    const org = await requireData(`orgs/${orgId}`, new AdminError('not-found', 'Empresa no encontrada.'));
    if (org.status !== 'active' || !org.drive?.connected) {
      throw new AdminError('failed-precondition', 'Esta empresa no puede recibir grabaciones ahora.');
    }
    const usageRef = usageRefFor(orgId); // el mismo día para reservar y para devolver
    const eventId = await reserve(orgId, org, codeHash, usageRef);
    try {
      return await provision({ orgId, org, eventId, codeHash, names, input });
    } catch (error) {
      await release(orgId, codeHash, usageRef).catch(releaseError => console.error(releaseError));
      throw error;
    }
  }

  async function provision({ orgId, org, eventId, codeHash, names, input }) {
    const event = await requireData(`orgs/${orgId}/events/${eventId}`, new AdminError('not-found', 'El evento ya no existe.'));
    const accessToken = await accessTokenFor(orgId);
    const eventFolder = await ensureFolder({ db, google, accessToken, orgId, eventId, eventName: event.name });
    const folderId = await google.createFolder(accessToken, { name: names.folder, parentId: eventFolder });
    const mimeType = input.mimeType.split(';')[0].trim();
    const sessionUri = await google.startResumableSession(accessToken, { name: names.file, parentId: folderId, mimeType, origin, size: input.size });
    const uploadId = newId();
    await db.doc(`orgs/${orgId}/uploads/${uploadId}`).create({
      eventId, codeHash, speaker: input.speaker.trim(), file: names.file, folderId, mimeType,
      status: 'open', createdAt: timestamp(now()),
    });
    return { uploadId, sessionUri, orgName: org.name, eventName: event.name };
  }

  return { createSession };
}
