import { describe, expect, it } from 'vitest';
import { API_AUDIENCE, ASSISTANT_AUDIENCE, CoreClient, CoreRequestError } from './core-client';
import { CoreTransportError } from './core-transport';
import { FakeCoreTransport, json, makeJwt, type FakeCoreRoute } from './test-support';

const tls = { ca: 'ca', cert: 'cert', key: 'key' };

function build(route: FakeCoreRoute, audience = ASSISTANT_AUDIENCE, now = () => 1_000_000) {
  const transport = new FakeCoreTransport(route);
  const client = new CoreClient({
    url: 'https://core.test',
    tls,
    audience,
    transportFactory: () => transport,
    now,
  });
  return { client, transport };
}

const tokenReply = (audience = ASSISTANT_AUDIENCE, refreshToken = 'refresh-1', now = 1_000_000) =>
  json(200, { accessToken: makeJwt(audience, 300, now), refreshToken, expiresIn: 300 });

describe('CoreClient', () => {
  it('obtains a token with an empty body and calls the tool with the bearer and an input envelope', async () => {
    const { client, transport } = build((request) => {
      if (request.path === '/v1/token') return tokenReply();
      return json(200, { items: [] });
    });

    await expect(client.invoke('clients.list', { after: 'x' })).resolves.toEqual({ items: [] });

    const [token, call] = transport.requests;
    expect(token).toMatchObject({ method: 'POST', path: '/v1/token', body: '{}' });
    expect(token!.headers.authorization).toBeUndefined();
    expect(call).toMatchObject({ method: 'POST', path: '/v1/tools/clients.list' });
    expect(JSON.parse(call!.body!)).toEqual({ input: { after: 'x' } });
    expect(call!.headers['content-type']).toBe('application/json');
    expect(call!.headers.authorization).toMatch(/^Bearer .+\..+\..+$/);
    expect(call!.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(call!.headers['x-request-id']).not.toBe(token!.headers['x-request-id']);
  });

  it('reuses the token and renews concurrent requests once', async () => {
    const { client, transport } = build((request) =>
      request.path === '/v1/token' ? tokenReply() : json(200, 'ok')
    );
    await Promise.all([
      client.invoke('a.b', {}),
      client.invoke('c.d', {}),
      client.invoke('e.f', {}),
    ]);
    await client.invoke('g.h', {});
    expect(transport.requests.filter((r) => r.path === '/v1/token')).toHaveLength(1);
    expect(transport.requests.filter((r) => r.path.startsWith('/v1/tools/'))).toHaveLength(4);
  });

  it('refreshes an expiring token with its refresh token and falls back to a new token', async () => {
    let now = 1_000_000;
    let refreshFails = false;
    const { client, transport } = build(
      (request) => {
        if (request.path === '/v1/token') return tokenReply(ASSISTANT_AUDIENCE, 'refresh-1', now);
        if (request.path === '/v1/refresh') {
          return refreshFails
            ? json(401, { code: 'unauthenticated', message: 'expired' })
            : tokenReply(ASSISTANT_AUDIENCE, 'refresh-2', now);
        }
        return json(200, 'ok');
      },
      ASSISTANT_AUDIENCE,
      () => now
    );
    await client.invoke('a.b', {});
    now += 295_000;
    await client.invoke('a.b', {});
    const refresh = transport.requests.find((r) => r.path === '/v1/refresh');
    expect(JSON.parse(refresh!.body!)).toEqual({ refreshToken: 'refresh-1' });

    now += 295_000;
    refreshFails = true;
    await client.invoke('a.b', {});
    expect(
      transport.requests
        .map((r) => r.path)
        .filter((p) => p.startsWith('/v1/t') && p !== '/v1/tools/a.b')
    ).toEqual(['/v1/token', '/v1/token']);
  });

  it('refuses a token issued for another audience', async () => {
    const { client } = build(() => tokenReply(API_AUDIENCE));
    await expect(client.invoke('a.b', {})).rejects.toMatchObject({ code: 'policy_denied' });
  });

  it('refuses a token without an expiry or one that cannot be read', async () => {
    const noExp = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ aud: ASSISTANT_AUDIENCE })
    ).toString('base64url')}.x`;
    await expect(
      build(() => json(200, { accessToken: noExp, refreshToken: 'r' })).client.invoke('a.b', {})
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      build(() => json(200, { accessToken: 'garbage', refreshToken: 'r' })).client.invoke('a.b', {})
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('surfaces Core failures with their code and message', async () => {
    const { client } = build((request) =>
      request.path === '/v1/token'
        ? tokenReply()
        : json(403, { code: 'policy_denied', message: 'owner only', details: {} })
    );
    await expect(client.invoke('work.summary', {})).rejects.toEqual(
      new CoreRequestError('policy_denied', 'owner only')
    );
  });

  it('renews once when Core stops honouring a cached token', async () => {
    let calls = 0;
    const { client, transport } = build((request) => {
      if (request.path === '/v1/token' || request.path === '/v1/refresh') return tokenReply();
      calls += 1;
      return calls === 2 ? json(401, { code: 'unauthenticated' }) : json(200, 'ok');
    });
    await client.invoke('a.b', {});
    await expect(client.invoke('a.b', {})).resolves.toBe('ok');
    expect(calls).toBe(3);
    expect(transport.requests.filter((r) => r.path === '/v1/token')).toHaveLength(2);
  });

  it('does not retry a refusal of a token it has just been issued', async () => {
    const { client, transport } = build((request) =>
      request.path === '/v1/token' ? tokenReply() : json(401, { code: 'unauthenticated' })
    );
    await expect(client.invoke('a.b', {})).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(transport.requests.filter((r) => r.path.startsWith('/v1/tools/'))).toHaveLength(1);
  });

  it('maps unreadable and non-JSON replies to Core error codes', async () => {
    const { client } = build((request) =>
      request.path === '/v1/token' ? tokenReply() : { status: 502, body: '<html>' }
    );
    await expect(client.invoke('a.b', {})).rejects.toMatchObject({ code: 'internal_error' });
  });

  it('lets transport failures through untouched and rejects malformed tool names', async () => {
    const { client } = build(() => {
      throw new CoreTransportError('unreachable', 'Core is not reachable');
    });
    await expect(client.invoke('a.b', {})).rejects.toMatchObject({ code: 'unreachable' });
    await expect(client.invoke('../etc', {})).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('closes its transport', () => {
    const { client, transport } = build(() => json(200, null));
    client.close();
    expect(transport.closed).toBe(true);
  });
});
