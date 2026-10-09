/**
 * Alta de empresas y de sus administradores (ADR 0001, CAM-TSK-0141).
 * Núcleo sin dependencias de Firebase: index.js le pasa Firestore, Auth y el
 * reloj, y traduce AdminError a HttpsError. caller = request.auth (o null).
 */

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_LIMITS = Object.freeze({ sessionsPerDay: 200, gbPerMonth: 100 });

export class AdminError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // un código de HttpsError: permission-denied, invalid-argument…
  }
}

const isSuperadmin = caller => caller?.token?.superadmin === true;

function requireSuperadmin(caller) {
  if (!isSuperadmin(caller)) throw new AdminError('permission-denied', 'Solo el dueño de onslide.');
}

function text(value, { field, max, min = 1 }) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.length < min || trimmed.length > max) {
    throw new AdminError('invalid-argument', `${field}: entre ${min} y ${max} caracteres.`);
  }
  return trimmed;
}

export function createAdminHandlers({ db, auth, newId, now, timestamp }) {
  async function requireDoc(path, what) {
    const snapshot = await db.doc(path).get();
    if (!snapshot.exists) throw new AdminError('not-found', `${what} no existe.`);
    return snapshot.data();
  }

  async function createOrg(caller, input) {
    requireSuperadmin(caller);
    const name = text(input?.name, { field: 'name', max: 120 });
    const slug = input?.slug;
    if (typeof slug !== 'string' || !SLUG.test(slug)) {
      throw new AdminError('invalid-argument', 'slug: minúsculas, números y guiones (3-40).');
    }
    const orgId = newId();
    await db.runTransaction(async tx => {
      if ((await tx.get(db.doc(`orgSlugs/${slug}`))).exists) {
        throw new AdminError('already-exists', `El slug ${slug} ya está en uso.`);
      }
      tx.create(db.doc(`orgs/${orgId}`), {
        name, slug, status: 'active', limits: { ...DEFAULT_LIMITS },
        drive: { connected: false }, createdAt: timestamp(now()),
      });
      tx.create(db.doc(`orgSlugs/${slug}`), { orgId });
    });
    return { orgId };
  }

  async function setOrgAdmin(caller, input) {
    requireSuperadmin(caller);
    const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!EMAIL.test(email)) throw new AdminError('invalid-argument', 'email no válido.');
    await requireDoc(`orgs/${input.orgId}`, 'La empresa');
    let user;
    try {
      user = await auth.getUserByEmail(email);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      throw new AdminError('not-found', 'Ese usuario tiene que entrar una vez en el panel antes.');
    }
    await auth.setCustomUserClaims(user.uid, { ...user.customClaims, orgId: input.orgId });
    return { uid: user.uid };
  }

  return { createOrg, setOrgAdmin };
}
