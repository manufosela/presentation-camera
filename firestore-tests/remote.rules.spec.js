// Reglas de Realtime Database del mando móvil (CAM-TSK-0167). Corre contra el emulador: npm run test:rules
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, remove, set, update } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createRemoteSession } from '../remoteSession.js';

let env;
const ID = 'abcdefghijklmnopqrstuv';
const hour = 3600 * 1000;
const db = () => env.unauthenticatedContext().database();
const at = path => ref(db(), `remote/${ID}${path}`);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-onslide',
    database: { rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearDatabase());

describe('crear la sesión', () => {
  it('el escritorio crea la sesión con el nodo inicial', async () => {
    await assertSucceeds(set(at(''), createRemoteSession(Date.now())));
  });

  it('no deja una caducidad de más de 12 h', async () => {
    await assertFails(set(at(''), { ...createRemoteSession(Date.now()), expiresAt: Date.now() + 13 * hour }));
  });

  it('no acepta un id que no son 22 caracteres base64url', async () => {
    await assertFails(set(ref(db(), 'remote/corto'), createRemoteSession(Date.now())));
  });

  it('nadie lista las sesiones', async () => {
    await assertFails(get(ref(db(), 'remote')));
  });

  it('no acepta campos fuera del modelo', async () => {
    await assertFails(set(at(''), { ...createRemoteSession(Date.now()), html: '<script>' }));
  });
});

describe('con la sesión abierta', () => {
  beforeEach(() => set(at(''), createRemoteSession(Date.now())));

  it('el móvil lee la sesión y envía un comando de la lista', async () => {
    await assertSucceeds(get(at('')));
    await assertSucceeds(update(at(''), { 'phone/online': true, cmd: { seq: 1, name: 'next', sentAt: Date.now() } }));
  });

  it('rechaza un comando fuera de la lista', async () => {
    await assertFails(set(at('/cmd'), { seq: 1, name: 'eval', sentAt: Date.now() }));
  });

  it('el escritorio confirma el comando', async () => {
    await assertSucceeds(set(at('/ack'), { seq: 1 }));
  });

  it('no deja alargar la caducidad', async () => {
    await assertFails(set(at('/expiresAt'), Date.now() + 11 * hour));
  });

  it('el escritorio la borra al cerrar', async () => {
    await assertSucceeds(remove(at('')));
  });
});

describe('sesión caducada', () => {
  beforeEach(() => env.withSecurityRulesDisabled(context =>
    set(ref(context.database(), `remote/${ID}`), { createdAt: Date.now() - 13 * hour, expiresAt: Date.now() - hour })));

  it('ya no acepta comandos', async () => {
    await assertFails(set(at('/cmd'), { seq: 1, name: 'next', sentAt: Date.now() }));
  });

  it('ya no se puede leer', async () => {
    await assertFails(get(at('')));
  });
});
