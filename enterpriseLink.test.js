import { describe, expect, it, vi } from 'vitest';
import { callFunction, readEnterpriseLink } from './enterpriseLink.js';

describe('readEnterpriseLink — enlace de empresa (CAM-TSK-0156)', () => {
  it('lee empresa y código y quita el código de la dirección', () => {
    const replace = vi.fn();
    const link = readEnterpriseLink(new URL('https://onsli.de/?org=acme&style=frame#code=ABCD-EFGH'), replace);
    expect(link).toEqual({ org: 'acme', code: 'ABCD-EFGH' });
    expect(replace).toHaveBeenCalledWith('https://onsli.de/?org=acme&style=frame');
  });

  it('sin código en el fragmento, solo la empresa y no toca la dirección', () => {
    const replace = vi.fn();
    expect(readEnterpriseLink(new URL('https://onsli.de/?org=acme'), replace)).toEqual({ org: 'acme', code: null });
    expect(replace).not.toHaveBeenCalled();
  });

  it('sin ?org o con un slug inválido, modo normal (null)', () => {
    expect(readEnterpriseLink(new URL('https://onsli.de/?style=frame'), vi.fn())).toBeNull();
    expect(readEnterpriseLink(new URL('https://onsli.de/?org=Acme%20Corp'), vi.fn())).toBeNull();
    expect(readEnterpriseLink(new URL('https://onsli.de/?org=../x'), vi.fn())).toBeNull();
  });
});

describe('callFunction — callables de onslide por fetch', () => {
  const ok = body => vi.fn(async () => ({ ok: true, json: async () => body }));

  it('envía {data} a la Function de europe-west1 y devuelve result', async () => {
    const fetch = ok({ result: { orgName: 'Acme' } });
    expect(await callFunction('describeCode', { org: 'acme' }, { fetch })).toEqual({ orgName: 'Acme' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://europe-west1-precam-app.cloudfunctions.net/describeCode');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(init.body)).toEqual({ data: { org: 'acme' } });
  });

  it('un error de la Function llega con su mensaje y su estado', async () => {
    const fetch = vi.fn(async () => ({ ok: false, json: async () => ({ error: { message: 'Este código ha caducado.', status: 'PERMISSION_DENIED' } }) }));
    await expect(callFunction('describeCode', {}, { fetch })).rejects.toMatchObject({ message: 'Este código ha caducado.', status: 'PERMISSION_DENIED' });
  });

  it('un fallo de red llega como error de red', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(callFunction('describeCode', {}, { fetch })).rejects.toMatchObject({ status: 'UNAVAILABLE' });
  });
});
