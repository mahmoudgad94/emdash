import { randomUUID } from 'node:crypto';
import {
  CoreTransportError,
  createHttp2CoreTransport,
  type CoreTransport,
  type CoreTransportFactory,
  type TlsMaterial,
} from './core-transport';

export const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_TIMEOUT_MS = 10_000;
const TOKEN_SKEW_MS = 10_000;

/** Core issues the assistant kind a token for the MCP audience and every other kind the API one. */
export const ASSISTANT_AUDIENCE = 'client-ops:mcp';
export const API_AUDIENCE = 'client-ops:api';

/** A request Core answered with a failure, or a token it issued that this client cannot accept. */
export class CoreRequestError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'CoreRequestError';
  }
}

type TokenPair = { accessToken: string; refreshToken: string };

export type CoreClientOptions = {
  url: string;
  tls: TlsMaterial;
  audience: string;
  transportFactory?: CoreTransportFactory;
  now?: () => number;
};

export type CoreCallOptions = { signal?: AbortSignal; timeoutMs?: number };

/** The Client Ops Core wire protocol: mutual-TLS HTTP/2, a short-lived bearer token, JSON tools. */
export class CoreClient {
  private readonly transport: CoreTransport;
  private readonly now: () => number;
  private pair: TokenPair | undefined;
  private expiresAt = 0;
  private renewing: Promise<void> | undefined;

  constructor(private readonly options: CoreClientOptions) {
    this.transport = (options.transportFactory ?? createHttp2CoreTransport)(
      options.url,
      options.tls
    );
    this.now = options.now ?? Date.now;
  }

  close(): void {
    this.transport.close();
  }

  /** Renews the token, a round trip that proves Core is reachable and accepts the identity. */
  async probe(): Promise<void> {
    await this.renewOnce();
  }

  async invoke(tool: string, input: unknown, options: CoreCallOptions = {}): Promise<unknown> {
    if (!/^[a-z0-9_.-]+$/i.test(tool)) throw new CoreRequestError('invalid_input', 'Invalid tool');
    for (let attempt = 0; ; attempt += 1) {
      const { token, fresh } = await this.token();
      try {
        return await this.request(
          `/v1/tools/${tool}`,
          { input },
          token,
          options.timeoutMs ?? REQUEST_TIMEOUT_MS,
          options.signal
        );
      } catch (error) {
        // A cached token Core no longer honours is renewed once; a fresh one is refused for real.
        if (
          attempt === 0 &&
          !fresh &&
          error instanceof CoreRequestError &&
          error.code === 'unauthenticated'
        ) {
          this.pair = undefined;
          this.expiresAt = 0;
          continue;
        }
        throw error;
      }
    }
  }

  private async request(
    path: string,
    body: unknown,
    token: string | undefined,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<unknown> {
    const response = await this.transport.request({
      method: 'POST',
      path,
      headers: {
        'content-type': 'application/json',
        'x-request-id': randomUUID(),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      timeoutMs,
      signal,
    });
    let value: unknown;
    try {
      value = JSON.parse(response.body);
    } catch {
      throw new CoreRequestError(
        response.status === 401 ? 'unauthenticated' : 'internal_error',
        'Core sent an unreadable response'
      );
    }
    if (response.status !== 200) {
      const failure = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
      throw new CoreRequestError(
        typeof failure.code === 'string' && failure.code
          ? failure.code
          : response.status === 401
            ? 'unauthenticated'
            : 'internal_error',
        typeof failure.message === 'string' && failure.message
          ? failure.message
          : 'Core refused the request'
      );
    }
    return value;
  }

  private async token(): Promise<{ token: string; fresh: boolean }> {
    let fresh = false;
    if (!this.pair || this.now() >= this.expiresAt - TOKEN_SKEW_MS) {
      fresh = true;
      await this.renewOnce();
    }
    if (!this.pair) throw new CoreRequestError('unauthenticated', 'Core issued no token');
    return { token: this.pair.accessToken, fresh };
  }

  private async renewOnce(): Promise<void> {
    this.renewing ??= this.renew().finally(() => {
      this.renewing = undefined;
    });
    await this.renewing;
  }

  private async renew(): Promise<void> {
    let pair: unknown;
    const previous = this.pair;
    this.pair = undefined;
    this.expiresAt = 0;
    if (previous) {
      try {
        pair = await this.request(
          '/v1/refresh',
          { refreshToken: previous.refreshToken },
          undefined,
          TOKEN_TIMEOUT_MS
        );
      } catch (error) {
        if (error instanceof CoreTransportError) throw error;
        pair = await this.request('/v1/token', {}, undefined, TOKEN_TIMEOUT_MS);
      }
    } else {
      pair = await this.request('/v1/token', {}, undefined, TOKEN_TIMEOUT_MS);
    }
    const accepted = this.accept(pair);
    this.pair = accepted.pair;
    this.expiresAt = accepted.expiresAt;
  }

  private accept(value: unknown): { pair: TokenPair; expiresAt: number } {
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    if (typeof record.accessToken !== 'string' || typeof record.refreshToken !== 'string') {
      throw new CoreRequestError('unauthenticated', 'Core issued an unreadable token');
    }
    const claims = decodeClaims(record.accessToken);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(this.options.audience)) {
      throw new CoreRequestError('policy_denied', 'Core issued a token for another audience');
    }
    if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) {
      throw new CoreRequestError('unauthenticated', 'Core issued a token without an expiry');
    }
    return {
      pair: { accessToken: record.accessToken, refreshToken: record.refreshToken },
      expiresAt: claims.exp * 1000,
    };
  }
}

/** The payload only: the channel is mutual TLS against a pinned CA, as in the Core's own client. */
function decodeClaims(token: string): { aud?: unknown; exp?: unknown } {
  const payload = token.split('.')[1];
  if (!payload) throw new CoreRequestError('unauthenticated', 'Core issued an unreadable token');
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims && typeof claims === 'object') return claims as { aud?: unknown; exp?: unknown };
  } catch {
    // fall through to the single refusal below
  }
  throw new CoreRequestError('unauthenticated', 'Core issued an unreadable token');
}
