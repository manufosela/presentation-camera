/**
 * Códigos de evento (ADR 0001 §4, CAM-TSK-0140): 128 bits aleatorios en base32
 * de Crockford por grupos de 4. En Firestore solo se guarda su SHA-256 (el id
 * del documento orgs/{orgId}/codes/{hash}); el código en claro se da una vez.
 * Solo sirven para reservar sesiones de subida de su evento.
 */

import { createHash } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 26; // 26 × 5 bits ≥ 128
const CONFUSABLE = { O: '0', I: '1', L: '1' };

function toBase32(bytes) {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out = ALPHABET[Number(value & 31n)] + out;
    value >>= 5n;
  }
  return out;
}

/** El código tal como lo escribe el ponente, normalizado; null si no es un código. */
export function normalizeEventCode(input) {
  if (typeof input !== 'string') return null;
  const compact = input.toUpperCase().replaceAll(/[\s-]/g, '').replaceAll(/[OIL]/g, ch => CONFUSABLE[ch]);
  if (compact.length !== CODE_LENGTH || [...compact].some(ch => !ALPHABET.includes(ch))) return null;
  return compact;
}

export function hashEventCode(input) {
  const code = normalizeEventCode(input);
  if (code === null) throw new Error('invalid-code');
  return createHash('sha256').update(code).digest('hex');
}

/** randomBytes(16) → { code (para mostrar una vez), hash (para guardar) }. */
export function generateEventCode(randomBytes) {
  const compact = toBase32(randomBytes(16));
  const code = compact.match(/.{1,4}/g).join('-');
  return { code, hash: hashEventCode(code) };
}

/** ¿Permite este código una subida más ahora? */
export function checkCodeUse(codeDoc, nowMs) {
  if (!codeDoc) return { ok: false, reason: 'unknown' };
  if (codeDoc.revoked) return { ok: false, reason: 'revoked' };
  if (codeDoc.expiresAt.toMillis() <= nowMs) return { ok: false, reason: 'expired' };
  if (codeDoc.uploads >= codeDoc.maxUploads) return { ok: false, reason: 'exhausted' };
  return { ok: true, eventId: codeDoc.eventId };
}

/** Comprueba y cuenta la subida en la misma transacción (sin doble uso). */
export async function reserveCodeUse(transaction, codeRef, nowMs) {
  const snapshot = await transaction.get(codeRef);
  const codeDoc = snapshot.exists ? snapshot.data() : null;
  const verdict = checkCodeUse(codeDoc, nowMs);
  if (verdict.ok) transaction.update(codeRef, { uploads: codeDoc.uploads + 1 });
  return verdict;
}
