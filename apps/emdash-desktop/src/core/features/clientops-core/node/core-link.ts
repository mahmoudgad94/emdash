import { err, ok, type Result } from '@emdash/shared';
import type { Logger } from '@emdash/shared/logger';
import type { CoreInvokeOptions, CoreInvoker, CoreLinkError } from '../api/node/core-invoker';
import {
  type CoreLinkOperationError,
  type CoreLinkState,
  type CoreLinkStatus,
  type EnrollmentRequest,
} from '../api/schemas';
import { API_AUDIENCE, ASSISTANT_AUDIENCE, CoreClient, CoreRequestError } from './core-client';
import { CoreTransportError, type CoreTransportFactory } from './core-transport';
import {
  createEnrollmentRequest,
  exportEnrollmentRequest,
  importEnrollmentResult,
  runOpenssl,
  type RunOpenssl,
} from './enrollment';
import {
  identityPaths,
  loadCoreUrl,
  loadIdentity,
  loadPendingEnrollment,
  removeIdentityFiles,
  saveCoreUrl,
  type CoreIdentityPaths,
  type LoadedIdentity,
} from './identity-files';

export type CoreLinkDeps = {
  /** The app's user data directory; the identity lives in a private folder inside it. */
  userDataDir: string;
  logger: Logger;
  transportFactory?: CoreTransportFactory;
  openssl?: RunOpenssl;
};

/** Core answered, so the connection works even though this particular call was refused. */
const CONNECTION_FAULTS = new Set(['unauthenticated', 'token_replayed']);

/**
 * The app's connection to Client Ops Core: owns the identity files, the HTTP/2 client and the
 * connection status. Keys and tokens never leave this class and are never logged.
 */
export class CoreLink implements CoreInvoker {
  private readonly paths: CoreIdentityPaths;
  private readonly logger: Logger;
  private loaded: Promise<void> | undefined;
  private coreUrl = '';
  private identity: LoadedIdentity | undefined;
  private pendingDeviceId: string | undefined;
  private client: CoreClient | undefined;
  private state: CoreLinkState = { kind: 'unconfigured' };
  private checking: Promise<CoreLinkStatus> | undefined;
  private disposed = false;

  constructor(private readonly deps: CoreLinkDeps) {
    this.paths = identityPaths(deps.userDataDir);
    this.logger = deps.logger.child({ subsystem: 'clientops-core' });
  }

  /** Re-reads the identity and proves it to Core by obtaining a token. */
  async check(): Promise<CoreLinkStatus> {
    await this.load();
    this.checking ??= this.probe().finally(() => {
      this.checking = undefined;
    });
    return this.checking;
  }

  async invoke(
    tool: string,
    input: unknown,
    options?: CoreInvokeOptions
  ): Promise<Result<unknown, CoreLinkError>> {
    await this.load();
    const client = this.ensureClient();
    if (!client) {
      return err({ code: 'not_connected', message: 'Client Ops Core is not set up' });
    }
    try {
      const value = await client.invoke(tool, input, options);
      this.setState({ kind: 'connected', deviceId: this.deviceId() });
      return ok(value);
    } catch (error) {
      const failure = this.toLinkError(error);
      if (this.isConnectionFault(error)) this.markError(failure);
      return err(failure);
    }
  }

  async setCoreUrl(value: string): Promise<Result<CoreLinkStatus, CoreLinkOperationError>> {
    await this.load();
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      return err({
        type: 'invalid_input',
        message: 'Enter a full URL such as https://localhost:28443',
      });
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      return err({ type: 'invalid_input', message: 'The Core URL must be an https address' });
    }
    try {
      await saveCoreUrl(this.paths, url.origin);
    } catch {
      return err({ type: 'io_failed', message: 'Could not save the Core URL' });
    }
    this.coreUrl = url.origin;
    this.dropClient();
    return ok(await this.check());
  }

  /** Creates a new identity request and writes it, ready for the Mac app, into `directory`. */
  async generateEnrollmentRequest(
    directory: string
  ): Promise<Result<{ filePath: string; request: EnrollmentRequest }, CoreLinkOperationError>> {
    await this.load();
    const created = await createEnrollmentRequest(this.paths, this.deps.openssl ?? runOpenssl);
    if (!created.success) return created;
    const exported = await exportEnrollmentRequest(created.data, directory);
    if (!exported.success) return exported;
    this.pendingDeviceId = created.data.deviceId;
    if (!this.identity) this.setState({ kind: 'enrolling', deviceId: created.data.deviceId });
    this.logger.info('Enrollment request created', { deviceId: created.data.deviceId });
    return ok({ filePath: exported.data, request: created.data });
  }

  async importEnrollmentResult(
    path: string
  ): Promise<Result<CoreLinkStatus, CoreLinkOperationError>> {
    await this.load();
    const installed = await importEnrollmentResult(this.paths, path);
    if (!installed.success) return installed;
    this.pendingDeviceId = undefined;
    this.dropClient();
    this.identity = await loadIdentity(this.paths);
    this.logger.info('Enrollment result imported', { deviceId: installed.data.deviceId });
    return ok(await this.check());
  }

  async disconnect(): Promise<CoreLinkStatus> {
    await this.load();
    this.dropClient();
    await removeIdentityFiles(this.paths);
    this.identity = undefined;
    this.pendingDeviceId = undefined;
    this.setState({ kind: 'unconfigured' });
    this.logger.info('Disconnected from Core');
    return this.snapshot();
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.dropClient();
    return Promise.resolve();
  }

  private load(): Promise<void> {
    this.loaded ??= (async () => {
      this.coreUrl = await loadCoreUrl(this.paths);
      this.identity = await loadIdentity(this.paths);
      this.pendingDeviceId = (await loadPendingEnrollment(this.paths))?.deviceId;
      this.state = this.identity
        ? {
            kind: 'error',
            code: 'unverified',
            message: 'Not checked yet',
            deviceId: this.deviceId(),
          }
        : this.pendingDeviceId
          ? { kind: 'enrolling', deviceId: this.pendingDeviceId }
          : { kind: 'unconfigured' };
    })();
    return this.loaded;
  }

  private async probe(): Promise<CoreLinkStatus> {
    const client = this.ensureClient();
    if (!client) {
      this.setState(
        this.pendingDeviceId
          ? { kind: 'enrolling', deviceId: this.pendingDeviceId }
          : { kind: 'unconfigured' }
      );
      return this.snapshot();
    }
    try {
      await client.probe();
      this.setState({ kind: 'connected', deviceId: this.deviceId() });
    } catch (error) {
      this.markError(this.toLinkError(error));
    }
    return this.snapshot();
  }

  private ensureClient(): CoreClient | undefined {
    if (this.disposed || !this.identity) return undefined;
    this.client ??= new CoreClient({
      url: this.coreUrl,
      tls: this.identity.tls,
      audience: this.identity.identity.kind === 'assistant' ? ASSISTANT_AUDIENCE : API_AUDIENCE,
      transportFactory: this.deps.transportFactory,
    });
    return this.client;
  }

  private dropClient(): void {
    this.client?.close();
    this.client = undefined;
  }

  private deviceId(): string {
    return this.identity?.identity.deviceId ?? '';
  }

  private isConnectionFault(error: unknown): boolean {
    if (error instanceof CoreTransportError) return true;
    return error instanceof CoreRequestError && CONNECTION_FAULTS.has(error.code);
  }

  private toLinkError(error: unknown): CoreLinkError {
    if (error instanceof CoreRequestError || error instanceof CoreTransportError) {
      return { code: error.code, message: error.message };
    }
    return { code: 'internal_error', message: 'Unexpected Core client failure' };
  }

  private markError(failure: CoreLinkError): void {
    this.setState({
      kind: 'error',
      code: failure.code,
      message: failure.message,
      deviceId: this.deviceId() || undefined,
    });
  }

  private setState(next: CoreLinkState): void {
    const previous = this.state;
    this.state = next;
    if (
      previous.kind !== next.kind ||
      (previous.kind === 'error' && next.kind === 'error' && previous.code !== next.code)
    ) {
      this.logger.info('Core connection status changed', {
        status: next.kind,
        ...(next.kind === 'error' ? { code: next.code } : {}),
      });
    }
  }

  private snapshot(): CoreLinkStatus {
    return { state: this.state, coreUrl: this.coreUrl };
  }
}

export function createCoreLink(deps: CoreLinkDeps): CoreLink {
  return new CoreLink(deps);
}
