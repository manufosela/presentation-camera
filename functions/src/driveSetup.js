/**
 * Configuración de producción de la conexión con Drive (CAM-TSK-0146): el
 * cliente OAuth onslide-web (su id es público), la URI de redirección de la
 * Function y el panel. Los secretos llegan de Secret Manager en cada llamada.
 */

import { createDriveConnect } from './driveConnect.js';
import { createGoogleClient } from './googleClient.js';
import { decryptToken, encryptToken } from './tokenCrypto.js';

export const DRIVE = Object.freeze({
  clientId: '914471047423-tef6cogd95op5rn6lu35omqoo26cq8dv.apps.googleusercontent.com',
  redirectUri: 'https://europe-west1-precam-app.cloudfunctions.net/driveConnectCallback',
  panelUrl: 'https://onsli.de/empresa.html',
});

export function buildDriveConnect({ db, fetch, clientSecret, tokenKey, randomBytes, now, timestamp }) {
  if (!clientSecret) throw new Error('Falta GOOGLE_CLIENT_SECRET.');
  if (Buffer.from(tokenKey ?? '', 'base64').length !== 32) throw new Error('ORG_TOKEN_KEY no es una clave de 32 bytes.');
  return createDriveConnect({
    db,
    google: createGoogleClient({ fetch, clientId: DRIVE.clientId, clientSecret, redirectUri: DRIVE.redirectUri }),
    seal: (token, orgId) => encryptToken(token, { keyBase64: tokenKey, orgId }),
    unseal: (sealed, orgId) => decryptToken(sealed, { keyBase64: tokenKey, orgId }),
    randomBytes, now, timestamp, panelUrl: DRIVE.panelUrl,
  });
}
