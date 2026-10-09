import { describe, expect, it } from 'vitest';
import { GoogleApiError, createGoogleClient } from './googleClient.js';

const idToken = payload => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;

// fetch falso: guarda cada petición y responde con lo que toque por URL.
function fakeFetch(responses) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), ...init });
    const match = responses.find(([prefix]) => String(url).startsWith(prefix));
    const [, status, body, headers = {}] = match;
    return {
      ok: status < 400, status,
      headers: { get: name => headers[name.toLowerCase()] ?? null },
      json: async () => body,
    };
  };
  return { fetch, calls };
}

const config = { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'sec', redirectUri: 'https://fn.test/driveConnectCallback' };

describe('googleClient — OAuth (CAM-TSK-0147)', () => {
  it('la URL de consentimiento pide drive.file, offline y el state', () => {
    const url = new URL(createGoogleClient({ fetch: null, ...config }).authUrl('st4te'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file openid email',
      access_type: 'offline', prompt: 'consent', state: 'st4te',
    });
  });

  it('canjea el código y devuelve refresh token y email', async () => {
    const { fetch, calls } = fakeFetch([['https://oauth2.googleapis.com/token', 200, {
      access_token: 'at', refresh_token: 'rt', scope: 'openid https://www.googleapis.com/auth/drive.file email',
      id_token: idToken({ email: 'it@acme.test' }),
    }]]);
    const result = await createGoogleClient({ fetch, ...config }).exchangeCode('c0de');
    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt', email: 'it@acme.test' });
    expect(Object.fromEntries(new URLSearchParams(calls[0].body))).toMatchObject({ code: 'c0de', grant_type: 'authorization_code', client_secret: 'sec' });
  });

  it('rechaza un consentimiento sin drive.file o sin refresh token', async () => {
    const noScope = fakeFetch([['https://oauth2.googleapis.com/token', 200, { access_token: 'at', refresh_token: 'rt', scope: 'openid email', id_token: idToken({}) }]]);
    await expect(createGoogleClient({ fetch: noScope.fetch, ...config }).exchangeCode('c')).rejects.toThrow('drive.file');
    const noRefresh = fakeFetch([['https://oauth2.googleapis.com/token', 200, { access_token: 'at', scope: 'https://www.googleapis.com/auth/drive.file', id_token: idToken({}) }]]);
    await expect(createGoogleClient({ fetch: noRefresh.fetch, ...config }).exchangeCode('c')).rejects.toThrow('refresh');
  });

  it('refresca el access token y propaga los errores de Google con su estado', async () => {
    const ok = fakeFetch([['https://oauth2.googleapis.com/token', 200, { access_token: 'fresh' }]]);
    expect(await createGoogleClient({ fetch: ok.fetch, ...config }).refreshAccessToken('rt')).toBe('fresh');
    const revoked = fakeFetch([['https://oauth2.googleapis.com/token', 400, { error: 'invalid_grant' }]]);
    const error = await createGoogleClient({ fetch: revoked.fetch, ...config }).refreshAccessToken('rt').catch(e => e);
    expect(error).toBeInstanceOf(GoogleApiError);
    expect(error).toMatchObject({ status: 400, reason: 'invalid_grant' });
  });
});

describe('googleClient — Drive', () => {
  it('crea una carpeta dentro de otra', async () => {
    const { fetch, calls } = fakeFetch([['https://www.googleapis.com/drive/v3/files', 200, { id: 'folder1' }]]);
    expect(await createGoogleClient({ fetch, ...config }).createFolder('at', { name: 'onslide', parentId: 'root1' })).toBe('folder1');
    expect(calls[0].headers.Authorization).toBe('Bearer at');
    expect(JSON.parse(calls[0].body)).toEqual({ name: 'onslide', mimeType: 'application/vnd.google-apps.folder', parents: ['root1'] });
  });

  it('abre la sesión resumable con el Origin de onslide y devuelve solo su URI', async () => {
    const { fetch, calls } = fakeFetch([['https://www.googleapis.com/upload/drive/v3/files', 200, {}, { location: 'https://upload.test/s1' }]]);
    const uri = await createGoogleClient({ fetch, ...config }).startResumableSession('at', {
      name: 'charla.webm', parentId: 'f1', mimeType: 'video/webm', origin: 'https://onsli.de', size: 1000,
    });
    expect(uri).toBe('https://upload.test/s1');
    expect(calls[0].url).toContain('uploadType=resumable');
    expect(calls[0].headers).toMatchObject({ Origin: 'https://onsli.de', 'X-Upload-Content-Type': 'video/webm', 'X-Upload-Content-Length': '1000' });
  });

  it('revoca un token', async () => {
    const { fetch, calls } = fakeFetch([['https://oauth2.googleapis.com/revoke', 200, {}]]);
    await createGoogleClient({ fetch, ...config }).revoke('rt');
    expect(Object.fromEntries(new URLSearchParams(calls[0].body))).toEqual({ token: 'rt' });
  });
});
