/**
 * Refresh token de la empresa cifrado con AES-256-GCM (ADR 0001 §3,
 * CAM-TSK-0104). La clave (ORG_TOKEN_KEY, 32 bytes en base64) vive en Secret
 * Manager; el orgId va como dato autenticado, así que un token copiado a otra
 * empresa no se descifra.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function keyFrom(keyBase64) {
  const key = Buffer.from(keyBase64 ?? '', 'base64');
  if (key.length !== 32) throw new Error('ORG_TOKEN_KEY debe tener 32 bytes en base64.');
  return key;
}

export function encryptToken(token, { keyBase64, orgId }) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(keyBase64), iv);
  cipher.setAAD(Buffer.from(orgId));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptToken(sealed, { keyBase64, orgId }) {
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(keyBase64), Buffer.from(sealed.iv, 'base64'));
  decipher.setAAD(Buffer.from(orgId));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
