import { describe, expect, it } from 'vitest';
import { fakeFirestore } from './fakeFirestore.js';

describe('fakeFirestore — Firestore en memoria para los tests (CAM-TSK-0153)', () => {
  it('doc: get es una foto del momento; create falla si existe', async () => {
    const db = fakeFirestore({ 'a/1': { n: 1 } });
    const snap = await db.doc('a/1').get();
    await db.doc('a/1').update({ n: 2 });
    expect(snap.data()).toEqual({ n: 1 });
    expect((await db.doc('a/1').get()).data()).toEqual({ n: 2 });
    await expect(db.doc('a/1').create({})).rejects.toThrow('already exists');
    await db.doc('a/1').delete();
    expect((await db.doc('a/1').get()).exists).toBe(false);
  });

  it('transacción: aplica las escrituras al final y nada si lanza', async () => {
    const db = fakeFirestore({ 'c/1': { v: 1 } });
    await expect(db.runTransaction(async tx => {
      tx.update(db.doc('c/1'), { v: 2 });
      throw new Error('aborta');
    })).rejects.toThrow('aborta');
    expect(db.docs.get('c/1')).toEqual({ v: 1 });
    await db.runTransaction(async tx => { tx.set(db.doc('c/2'), { v: 3 }); tx.delete(db.doc('c/1')); });
    expect([...db.docs.keys()]).toEqual(['c/2']);
  });

  it('transacción: leer después de escribir falla, como en Firestore', async () => {
    const db = fakeFirestore();
    await expect(db.runTransaction(async tx => {
      tx.set(db.doc('x/1'), {});
      await tx.get(db.doc('x/2'));
    })).rejects.toThrow('reads before');
  });
});
