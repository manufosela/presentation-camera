import { describe, expect, it } from 'vitest';
import { checkCodeUse, generateEventCode, hashEventCode, normalizeEventCode, reserveCodeUse } from './eventCodes.js';

const NOW = Date.UTC(2026, 9, 10);
const at = ms => ({ toMillis: () => ms }); // como un Timestamp de Firestore
const valid = { eventId: 'ev1', expiresAt: at(NOW + 3600_000), revoked: false, maxUploads: 3, uploads: 0 };

describe('generateEventCode — 128 bits, solo se guarda el hash (CAM-TSK-0140)', () => {
  it('da un código legible por grupos y su sha-256', () => {
    const { code, hash } = generateEventCode(() => new Uint8Array(16).fill(0xff));
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{1,4}){6}$/);
    expect(code.replaceAll('-', '')).toHaveLength(26);
    expect(hash).toBe(hashEventCode(code));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('dos códigos con distinto azar son distintos', () => {
    const a = generateEventCode(() => new Uint8Array(16).fill(1));
    const b = generateEventCode(() => new Uint8Array(16).fill(2));
    expect(a.code).not.toBe(b.code);
  });
});

describe('normalizeEventCode — lo que escribe el ponente', () => {
  it('ignora guiones, espacios y minúsculas y corrige letras confundibles', () => {
    const { code } = generateEventCode(() => new Uint8Array(16).fill(0x10));
    const typed = ` ${code.toLowerCase().replaceAll('-', ' ')} `;
    expect(normalizeEventCode(typed)).toBe(code.replaceAll('-', ''));
    expect(normalizeEventCode('O'.repeat(26))).toBe('0'.repeat(26));
    expect(hashEventCode(typed)).toBe(hashEventCode(code));
  });

  it('rechaza longitudes o caracteres que no son de un código', () => {
    expect(normalizeEventCode('ABC')).toBeNull();
    expect(normalizeEventCode('U'.repeat(26))).toBeNull();
    expect(normalizeEventCode(42)).toBeNull();
    expect(() => hashEventCode('ABC')).toThrow('invalid-code');
  });
});

describe('checkCodeUse — caducidad, revocación y tope', () => {
  it.each([
    ['unknown', null],
    ['revoked', { ...valid, revoked: true }],
    ['expired', { ...valid, expiresAt: at(NOW) }],
    ['exhausted', { ...valid, uploads: 3 }],
  ])('rechaza con el motivo %s', (reason, codeDoc) => {
    expect(checkCodeUse(codeDoc, NOW)).toEqual({ ok: false, reason });
  });

  it('acepta un código vigente', () => {
    expect(checkCodeUse(valid, NOW)).toEqual({ ok: true, eventId: 'ev1' });
  });
});

describe('reserveCodeUse — dentro de una transacción', () => {
  function fakeTransaction(data) {
    const updates = [];
    return {
      updates,
      get: async ref => ({ exists: data !== null, ref, data: () => data }),
      update: (ref, change) => updates.push({ ref, change }),
    };
  }

  it('cuenta una subida solo si el código es válido', async () => {
    const tx = fakeTransaction(valid);
    expect(await reserveCodeUse(tx, 'ref1', NOW)).toEqual({ ok: true, eventId: 'ev1' });
    expect(tx.updates).toEqual([{ ref: 'ref1', change: { uploads: 1 } }]);
  });

  it('no cuenta nada si se rechaza', async () => {
    const tx = fakeTransaction({ ...valid, revoked: true });
    expect(await reserveCodeUse(tx, 'ref1', NOW)).toEqual({ ok: false, reason: 'revoked' });
    expect(tx.updates).toEqual([]);
  });
});
