import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { CoreTransport, CoreTransportRequest, CoreTransportResponse } from './core-transport';

const execFileAsync = promisify(execFile);

export async function hasOpenssl(): Promise<boolean> {
  try {
    await execFileAsync('openssl', ['version']);
    return true;
  } catch {
    return false;
  }
}

export async function makeTempDir(): Promise<{ dir: string; remove: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'clientops-test-'));
  return { dir, remove: () => rm(dir, { recursive: true, force: true }) };
}

/** An unsigned JWT with the claims Core's client reads: the audience and the expiry. */
export function makeJwt(audience: string, expiresInSeconds = 300, now = Date.now()): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'at+jwt' })}.${encode({
    aud: audience,
    exp: Math.floor(now / 1000) + expiresInSeconds,
  })}.signature`;
}

/** A test certificate authority that signs the certificate requests the enrollment creates. */
export class TestCa {
  private constructor(
    private readonly dir: string,
    readonly caPem: string
  ) {}

  static async create(dir: string): Promise<TestCa> {
    const key = join(dir, 'ca-key.pem');
    const cert = join(dir, 'ca.pem');
    await execFileAsync('openssl', [
      'ecparam',
      '-name',
      'prime256v1',
      '-genkey',
      '-noout',
      '-out',
      key,
    ]);
    await execFileAsync('openssl', [
      'req',
      '-x509',
      '-new',
      '-key',
      key,
      '-subj',
      '/CN=Test Core CA',
      '-days',
      '2',
      '-out',
      cert,
    ]);
    return new TestCa(dir, await readFile(cert, 'utf8'));
  }

  /** A fresh key and a certificate for it signed by this CA, as a TLS server or client. */
  async issue(
    commonName: string,
    usage: 'server' | 'client'
  ): Promise<{ key: string; cert: string }> {
    const keyFile = join(this.dir, `${commonName}-key.pem`);
    const extFile = join(this.dir, `${commonName}.ext`);
    await execFileAsync('openssl', [
      'ecparam',
      '-name',
      'prime256v1',
      '-genkey',
      '-noout',
      '-out',
      keyFile,
    ]);
    const { stdout: csr } = await execFileAsync('openssl', [
      'req',
      '-new',
      '-key',
      keyFile,
      '-subj',
      `/CN=${commonName}`,
    ]);
    await writeFile(
      extFile,
      usage === 'server'
        ? 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n'
        : 'extendedKeyUsage=clientAuth\n'
    );
    const cert = await this.sign(csr, commonName, extFile);
    return { key: await readFile(keyFile, 'utf8'), cert };
  }

  async sign(csrPem: string, commonName: string, extFile?: string): Promise<string> {
    const csr = join(this.dir, `${commonName}.csr`);
    const out = join(this.dir, `${commonName}.pem`);
    await writeFile(csr, csrPem);
    await execFileAsync('openssl', [
      'x509',
      '-req',
      '-in',
      csr,
      '-CA',
      join(this.dir, 'ca.pem'),
      '-CAkey',
      join(this.dir, 'ca-key.pem'),
      '-CAcreateserial',
      '-days',
      '2',
      '-out',
      out,
      ...(extFile ? ['-extfile', extFile] : []),
    ]);
    return readFile(out, 'utf8');
  }
}

export type FakeCoreRoute = (
  request: CoreTransportRequest
) => CoreTransportResponse | Promise<CoreTransportResponse>;

/** A transport that answers from a handler and records every request. */
export class FakeCoreTransport implements CoreTransport {
  readonly requests: CoreTransportRequest[] = [];
  closed = false;

  constructor(private readonly route: FakeCoreRoute) {}

  async request(request: CoreTransportRequest): Promise<CoreTransportResponse> {
    this.requests.push(request);
    return this.route(request);
  }

  close(): void {
    this.closed = true;
  }
}

export const json = (status: number, body: unknown): CoreTransportResponse => ({
  status,
  body: JSON.stringify(body),
});
