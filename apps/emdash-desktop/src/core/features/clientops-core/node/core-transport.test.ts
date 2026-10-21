import {
  createSecureServer,
  createServer,
  type Http2SecureServer,
  type Http2Server,
} from 'node:http2';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { classifyTransportFailure, CoreTransportError, Http2CoreTransport } from './core-transport';
import { hasOpenssl, makeTempDir, TestCa } from './test-support';

const tls = { ca: '', cert: '', key: '' };
const servers: Http2Server[] = [];
const transports: Http2CoreTransport[] = [];

async function listen(handler: Parameters<Http2Server['on']>[1]): Promise<string> {
  const server = createServer();
  server.on('stream', handler as never);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function transportFor(url: string): Http2CoreTransport {
  const transport = new Http2CoreTransport(url, tls);
  transports.push(transport);
  return transport;
}

afterEach(async () => {
  for (const transport of transports.splice(0)) transport.close();
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))
  );
});

describe('Http2CoreTransport', () => {
  it('sends method, path, headers and body over one HTTP/2 session and reads the reply', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const url = await listen((stream, headers) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        seen.push({ ...headers, body: Buffer.concat(chunks).toString() });
        stream.respond({ ':status': 200, 'content-type': 'application/json' });
        stream.end('{"ok":true}');
      });
    });
    const transport = transportFor(url);

    const first = await transport.request({
      method: 'POST',
      path: '/v1/tools/clients.list',
      headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: '{"input":{}}',
      timeoutMs: 2_000,
    });
    const second = await transport.request({
      method: 'POST',
      path: '/v1/token',
      headers: {},
      body: '{}',
      timeoutMs: 2_000,
    });

    expect(first).toEqual({ status: 200, body: '{"ok":true}' });
    expect(second.status).toBe(200);
    expect(seen[0]).toMatchObject({
      ':method': 'POST',
      ':path': '/v1/tools/clients.list',
      authorization: 'Bearer t',
      body: '{"input":{}}',
    });
  });

  it('returns non-200 replies to the caller instead of throwing', async () => {
    const url = await listen((stream) => {
      stream.respond({ ':status': 403 });
      stream.end('{"code":"policy_denied"}');
    });
    await expect(
      transportFor(url).request({
        method: 'POST',
        path: '/x',
        headers: {},
        body: '{}',
        timeoutMs: 2_000,
      })
    ).resolves.toEqual({ status: 403, body: '{"code":"policy_denied"}' });
  });

  it('times out a request Core never answers', async () => {
    const url = await listen(() => undefined);
    await expect(
      transportFor(url).request({
        method: 'POST',
        path: '/x',
        headers: {},
        body: '{}',
        timeoutMs: 50,
      })
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('stops a request when the caller aborts it', async () => {
    const url = await listen(() => undefined);
    const controller = new AbortController();
    const pending = transportFor(url).request({
      method: 'POST',
      path: '/x',
      headers: {},
      body: '{}',
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'aborted' });
  });

  it('reports an unreachable Core', async () => {
    const url = await listen(() => undefined);
    const port = new URL(url).port;
    await Promise.all(
      servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))
    );
    const error = await transportFor(`http://127.0.0.1:${port}`)
      .request({ method: 'POST', path: '/x', headers: {}, body: '{}', timeoutMs: 2_000 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CoreTransportError);
    expect((error as CoreTransportError).code).toBe('unreachable');
  });
});

describe('classifyTransportFailure', () => {
  it('tells refused TLS from an unreachable host from everything else', () => {
    const coded = (code: string, message = '') => Object.assign(new Error(message), { code });
    expect(classifyTransportFailure(coded('ECONNREFUSED')).code).toBe('unreachable');
    expect(classifyTransportFailure(coded('ERR_TLS_CERT_ALTNAME_INVALID')).code).toBe(
      'tls_rejected'
    );
    expect(classifyTransportFailure(coded('UNABLE_TO_VERIFY_LEAF_SIGNATURE')).code).toBe(
      'tls_rejected'
    );
    expect(classifyTransportFailure(coded('ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED')).code).toBe(
      'tls_rejected'
    );
    expect(classifyTransportFailure(new Error('boom')).code).toBe('transport_error');
  });

  it('never carries the underlying message, which could name key material', () => {
    const error = classifyTransportFailure(
      Object.assign(new Error('-----BEGIN PRIVATE KEY----- leaked'), { code: 'ERR_SSL_X' })
    );
    expect(error.message).not.toContain('PRIVATE KEY');
  });
});

describe.skipIf(!(await hasOpenssl()))('mutual TLS', () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const close of closers.splice(0)) await close();
  });

  async function secureCore() {
    const temp = await makeTempDir();
    const ca = await TestCa.create(temp.dir);
    const server = await ca.issue('localhost', 'server');
    const core: Http2SecureServer = createSecureServer({
      key: server.key,
      cert: server.cert,
      ca: ca.caPem,
      requestCert: true,
      rejectUnauthorized: true,
    });
    core.on('stream', (stream) => {
      stream.respond({ ':status': 200 });
      stream.end('"hello"');
    });
    await new Promise<void>((resolve) => core.listen(0, '127.0.0.1', resolve));
    closers.push(() => new Promise((resolve) => core.close(() => resolve())), temp.remove);
    return { ca, temp, url: `https://localhost:${(core.address() as AddressInfo).port}` };
  }

  const ask = (transport: Http2CoreTransport) =>
    transport.request({ method: 'POST', path: '/x', headers: {}, body: '{}', timeoutMs: 3_000 });

  it('talks to a server that requires and verifies the client certificate', async () => {
    const { ca, url } = await secureCore();
    const client = await ca.issue('emdash-test', 'client');
    const transport = new Http2CoreTransport(url, { ca: ca.caPem, ...client });
    transports.push(transport);
    await expect(ask(transport)).resolves.toEqual({ status: 200, body: '"hello"' });
  });

  it('is rejected as a TLS failure when the identity comes from another authority', async () => {
    const { ca, url } = await secureCore();
    const rogue = await TestCa.create((await makeTempDir()).dir);
    const stranger = await rogue.issue('emdash-test', 'client');
    const transport = new Http2CoreTransport(url, { ca: ca.caPem, ...stranger });
    transports.push(transport);
    await expect(ask(transport)).rejects.toMatchObject({ code: 'tls_rejected' });
  });

  it('refuses a server that the pinned authority did not issue', async () => {
    const { url } = await secureCore();
    const other = await makeTempDir();
    closers.push(other.remove);
    const otherCa = await TestCa.create(other.dir);
    const client = await otherCa.issue('emdash-test', 'client');
    const transport = new Http2CoreTransport(url, { ca: otherCa.caPem, ...client });
    transports.push(transport);
    await expect(ask(transport)).rejects.toMatchObject({ code: 'tls_rejected' });
  });
});
