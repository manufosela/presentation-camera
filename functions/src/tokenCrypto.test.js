import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from './tokenCrypto.js';

const key = randomBytes(32).toString('base64');

describe('tokenCrypto — refresh token cifrado por empresa (CAM-TSK-0104)', () => {
  it('cifra y descifra el mismo token, sin dejarlo en claro', () => {
    const sealed = encryptToken('1//refresh-token', { keyBase64: key, orgId: 'org1' });
    expect(Object.keys(sealed).toSorted()).toEqual(['ciphertext', 'iv', 'tag']);
    expect(JSON.stringify(sealed)).not.toContain('refresh-token');
    expect(decryptToken(sealed, { keyBase64: key, orgId: 'org1' })).toBe('1//refresh-token');
  });

  it('cada cifrado usa un iv distinto', () => {
    const a = encryptToken('t', { keyBase64: key, orgId: 'org1' });
    const b = encryptToken('t', { keyBase64: key, orgId: 'org1' });
    expect(a.iv).not.toBe(b.iv);
  });

  it('falla con otra clave, con otra empresa o si se manipula', () => {
    const sealed = encryptToken('t', { keyBase64: key, orgId: 'org1' });
    const otherKey = randomBytes(32).toString('base64');
    expect(() => decryptToken(sealed, { keyBase64: otherKey, orgId: 'org1' })).toThrow();
    expect(() => decryptToken(sealed, { keyBase64: key, orgId: 'org2' })).toThrow();
    const tampered = { ...sealed, ciphertext: Buffer.from('x').toString('base64') };
    expect(() => decryptToken(tampered, { keyBase64: key, orgId: 'org1' })).toThrow();
  });

  it('exige una clave de 32 bytes', () => {
    expect(() => encryptToken('t', { keyBase64: 'corta', orgId: 'org1' })).toThrow('ORG_TOKEN_KEY');
  });
});
