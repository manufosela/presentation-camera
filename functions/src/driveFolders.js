/**
 * Carpetas onslide/evento en el Drive de la empresa (ADR 0001 §5,
 * CAM-TSK-0151): se crean la primera vez y sus ids se guardan en
 * orgs/{orgId}/private/folders (no en el evento: las reglas solo dejan al
 * panel name/startsAt/endsAt). Si dos subidas crean a la vez la misma carpeta,
 * gana la que se guardó primero.
 */

/** Guarda un id si aún no hay ninguno en esa posición; devuelve el que queda. */
function keepFirst(db, ref, pick, put) {
  return db.runTransaction(async tx => {
    const data = (await tx.get(ref)).data() ?? {};
    const existing = pick(data);
    if (existing) return existing;
    const { next, id } = put(data);
    tx.set(ref, next);
    return id;
  });
}

export async function ensureEventFolder({ db, google, accessToken, orgId, eventId, eventName }) {
  const ref = db.doc(`orgs/${orgId}/private/folders`);
  const current = await db.runTransaction(async tx => (await tx.get(ref)).data() ?? {});
  if (current.events?.[eventId]) return current.events[eventId];

  let root = current.root;
  if (!root) {
    const createdRoot = await google.createFolder(accessToken, { name: 'onslide' });
    root = await keepFirst(db, ref, data => data.root, data => ({ next: { ...data, root: createdRoot }, id: createdRoot }));
  }

  const created = await google.createFolder(accessToken, { name: eventName, parentId: root });
  return keepFirst(db, ref, data => data.events?.[eventId], data => ({
    next: { ...data, events: { ...data.events, [eventId]: created } }, id: created,
  }));
}
