/**
 * Functions de onslide (ADR 0001): callables en europe-west1. Aquí solo se
 * cablea; la lógica vive en src/ y se prueba sin Firebase.
 */

import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createAdminHandlers } from './src/adminHandlers.js';
import { wrapHandler } from './src/callable.js';

setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });
initializeApp();

const db = getFirestore();
const handlers = createAdminHandlers({
  db,
  auth: getAuth(),
  randomBytes,
  newId: () => db.collection('orgs').doc().id,
  now: () => Date.now(),
  timestamp: ms => Timestamp.fromMillis(ms),
});

const callable = handler => onCall({ cors: ['https://onsli.de'] }, wrapHandler(handler, {
  HttpsError,
  logError: error => console.error(error),
}));

export const createOrg = callable(handlers.createOrg);
export const setOrgAdmin = callable(handlers.setOrgAdmin);
export const createEventCode = callable(handlers.createEventCode);
