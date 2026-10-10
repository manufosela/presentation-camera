/**
 * Modo empresa (CAM-TSK-0156): el enlace que reparte la empresa es
 * onsli.de/?org=<slug>#code=<código>. El código va en el fragmento para que no
 * llegue a ningún servidor ni a los registros, y en cuanto se lee se quita de
 * la dirección para no compartirlo sin querer al copiarla.
 * callFunction llama a las callables de onslide por fetch, sin el SDK.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const FUNCTIONS_BASE = 'https://europe-west1-precam-app.cloudfunctions.net';

/** { org, code|null } si la dirección es de una empresa; null en modo normal. */
export function readEnterpriseLink(url, replaceUrl = next => history.replaceState(null, '', next)) {
  const org = url.searchParams.get('org');
  if (!org || !SLUG.test(org)) return null;
  const code = new URLSearchParams(url.hash.slice(1)).get('code');
  if (code !== null) {
    const clean = new URL(url);
    clean.hash = '';
    replaceUrl(clean.toString());
  }
  return { org, code };
}

export class FunctionError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function callFunction(name, data, { fetch = globalThis.fetch } = {}) {
  let response;
  try {
    response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
  } catch (error) {
    throw new FunctionError(error.message, 'UNAVAILABLE');
  }
  const body = await response.json();
  if (!response.ok || body.error) throw new FunctionError(body.error?.message ?? 'Error', body.error?.status ?? 'INTERNAL');
  return body.result;
}
