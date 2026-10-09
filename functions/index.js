/**
 * Functions de onslide (ADR 0001) en europe-west1. Aquí solo se
 * cablea; la lógica vive en src/ y se prueba sin Firebase.
 */

import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { createAdminHandlers } from './src/adminHandlers.js';
import { wrapHandler } from './src/callable.js';
import { buildDriveConnect } from './src/driveSetup.js';

const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET');
const ORG_TOKEN_KEY = defineSecret('ORG_TOKEN_KEY');
const DRIVE_SECRETS = [GOOGLE_CLIENT_SECRET, ORG_TOKEN_KEY];

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

const callable = (handler, options = {}) => onCall({ cors: ['https://onsli.de'], ...options }, wrapHandler(handler, {
  HttpsError,
  logError: error => console.error(error),
}));

export const createOrg = callable(handlers.createOrg);
export const setOrgAdmin = callable(handlers.setOrgAdmin);
export const createEventCode = callable(handlers.createEventCode);

// Conexión con Drive (CAM-TSK-0145/0148): los secretos solo existen al ejecutar.
const driveConnect = () => buildDriveConnect({
  db, fetch, randomBytes,
  clientSecret: GOOGLE_CLIENT_SECRET.value(),
  tokenKey: ORG_TOKEN_KEY.value(),
  now: () => Date.now(),
  timestamp: ms => Timestamp.fromMillis(ms),
});

export const driveConnectStart = callable((caller, data) => driveConnect().start(caller, data), { secrets: DRIVE_SECRETS });
export const driveDisconnect = callable((caller, data) => driveConnect().disconnect(caller, data), { secrets: DRIVE_SECRETS });
export const driveConnectCallback = onRequest({ secrets: DRIVE_SECRETS }, async (request, response) => {
  response.redirect(302, await driveConnect().callback(request.query));
});
