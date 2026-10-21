import { connect, type ClientHttp2Session } from 'node:http2';

export type TlsMaterial = { ca: string; cert: string; key: string };

export type CoreTransportCode =
  | 'unreachable'
  | 'tls_rejected'
  | 'timeout'
  | 'aborted'
  | 'transport_error';

/** A request that never produced a Core response. The outcome of the call is unknown. */
export class CoreTransportError extends Error {
  constructor(
    readonly code: CoreTransportCode,
    message: string
  ) {
    super(message);
    this.name = 'CoreTransportError';
  }
}

export type CoreTransportRequest = {
  method: 'GET' | 'POST';
  path: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type CoreTransportResponse = { status: number; body: string };

export interface CoreTransport {
  request(request: CoreTransportRequest): Promise<CoreTransportResponse>;
  close(): void;
}

export type CoreTransportFactory = (url: string, tls: TlsMaterial) => CoreTransport;

const IDLE_CLOSE_MS = 60_000;
/** TLS 1.3 reports a refused client certificate after the handshake, on the session. */
const SESSION_ERROR_GRACE_MS = 25;
const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EPIPE',
  'ERR_HTTP2_STREAM_CANCEL',
  'ERR_HTTP2_SESSION_ERROR',
]);

export function classifyTransportFailure(error: unknown): CoreTransportError {
  if (error instanceof CoreTransportError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : '';
  if (
    typeof code === 'string' &&
    (code.startsWith('ERR_TLS') ||
      code.startsWith('ERR_SSL') ||
      /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code) ||
      /certificate|handshake|ssl|tls/i.test(message))
  ) {
    return new CoreTransportError('tls_rejected', 'Core rejected the TLS handshake');
  }
  if (typeof code === 'string' && UNREACHABLE_CODES.has(code)) {
    return new CoreTransportError('unreachable', 'Core is not reachable');
  }
  return new CoreTransportError('transport_error', 'Core connection failed');
}

/** One HTTP/2 session to Core over mutual TLS, reopened on demand and closed when idle. */
export class Http2CoreTransport implements CoreTransport {
  private session: ClientHttp2Session | undefined;
  private sessionError: unknown;
  private sessionAnswered = false;

  constructor(
    private readonly url: string,
    private readonly tls: TlsMaterial
  ) {}

  close(): void {
    this.session?.destroy();
    this.session = undefined;
  }

  request(request: CoreTransportRequest): Promise<CoreTransportResponse> {
    const deadline = AbortSignal.timeout(request.timeoutMs);
    const signal = request.signal ? AbortSignal.any([deadline, request.signal]) : deadline;
    const aborted = () =>
      deadline.aborted
        ? new CoreTransportError('timeout', 'Core request timed out')
        : new CoreTransportError('aborted', 'Core request aborted');
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(aborted());
        return;
      }
      let settled = false;
      const settle = (finish: () => void) => {
        if (settled) return;
        settled = true;
        finish();
      };
      let stream;
      try {
        stream = this.connection().request(
          { ':method': request.method, ':path': request.path, ...request.headers },
          { signal }
        );
      } catch (error) {
        reject(classifyTransportFailure(error));
        return;
      }
      let status = 0;
      const chunks: Buffer[] = [];
      // A stream that ends with no response was cut by the session; its error says why.
      const failWithoutResponse = () =>
        setTimeout(
          () =>
            settle(() =>
              reject(
                this.sessionError
                  ? classifyTransportFailure(this.sessionError)
                  : this.sessionAnswered
                    ? new CoreTransportError('transport_error', 'Core closed the connection')
                    : // TLS 1.3 refuses a client certificate after the handshake by closing the
                      // stream with no error; a session that never answered is that case.
                      new CoreTransportError('tls_rejected', 'Core rejected the TLS handshake')
              )
            ),
          SESSION_ERROR_GRACE_MS
        );
      stream.on('response', (headers) => {
        this.sessionAnswered = true;
        status = Number(headers[':status']);
      });
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        if (status === 0) failWithoutResponse();
        else settle(() => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
      });
      stream.on('error', (error) =>
        settle(() => reject(signal.aborted ? aborted() : classifyTransportFailure(error)))
      );
      stream.on('close', () => {
        if (status === 0) failWithoutResponse();
        else
          settle(() =>
            reject(new CoreTransportError('transport_error', 'Core closed the connection'))
          );
      });
      stream.end(request.body);
    });
  }

  private connection(): ClientHttp2Session {
    if (!this.session || this.session.destroyed || this.session.closed) {
      const session = connect(this.url, this.tls);
      this.sessionError = undefined;
      this.sessionAnswered = false;
      const forget = () => {
        if (this.session === session) this.session = undefined;
      };
      session.on('error', (error) => {
        this.sessionError = error;
        forget();
      });
      session.on('close', forget);
      session.setTimeout(IDLE_CLOSE_MS, () => session.close());
      this.session = session;
    }
    return this.session;
  }
}

export const createHttp2CoreTransport: CoreTransportFactory = (url, tls) =>
  new Http2CoreTransport(url, tls);
