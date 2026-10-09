/**
 * Cliente mínimo de Google por REST (ADR 0001 §3 y §5, CAM-TSK-0147): OAuth
 * con drive.file y offline, refresco del token, carpetas y sesiones de subida
 * resumable de Drive. fetch se inyecta para probarlo sin red.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'application/vnd.google-apps.folder';

export class GoogleApiError extends Error {
  constructor(status, reason) {
    super(`Google respondió ${status}: ${reason}`);
    this.status = status;
    this.reason = reason;
  }
}

// El id_token llega directo de Google por TLS en el canje: basta leer su email.
const emailFromIdToken = idToken => JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()).email ?? null;

export function createGoogleClient({ fetch, clientId, clientSecret, redirectUri }) {
  async function call(url, init) {
    const response = await fetch(url, init);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new GoogleApiError(response.status, body.error?.message ?? body.error ?? 'unknown');
    }
    return response;
  }

  const postForm = (url, fields) => call(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });

  function authUrl(state) {
    const params = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
      scope: `${DRIVE_FILE} openid email`, access_type: 'offline', prompt: 'consent', state,
    });
    return `${AUTH_URL}?${params}`;
  }

  async function exchangeCode(code) {
    const tokens = await (await postForm(TOKEN_URL, {
      code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code',
    })).json();
    if (!tokens.scope?.split(' ').includes(DRIVE_FILE)) throw new Error('No se concedió el permiso drive.file.');
    if (!tokens.refresh_token) throw new Error('Google no devolvió refresh token.');
    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, email: emailFromIdToken(tokens.id_token) };
  }

  async function refreshAccessToken(refreshToken) {
    const tokens = await (await postForm(TOKEN_URL, {
      refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token',
    })).json();
    return tokens.access_token;
  }

  async function createFolder(accessToken, { name, parentId }) {
    const response = await call(`${FILES_URL}?fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) }),
    });
    return (await response.json()).id;
  }

  /** Abre la sesión con el Origin del navegador que subirá: así Drive le da CORS. */
  async function startResumableSession(accessToken, { name, parentId, mimeType, origin, size }) {
    const headers = {
      Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8',
      Origin: origin, 'X-Upload-Content-Type': mimeType,
      ...(size === undefined ? {} : { 'X-Upload-Content-Length': String(size) }),
    };
    const response = await call(UPLOAD_URL, { method: 'POST', headers, body: JSON.stringify({ name, parents: [parentId] }) });
    return response.headers.get('location');
  }

  async function revoke(token) {
    await postForm(REVOKE_URL, { token });
  }

  return { authUrl, exchangeCode, refreshAccessToken, createFolder, startResumableSession, revoke };
}
