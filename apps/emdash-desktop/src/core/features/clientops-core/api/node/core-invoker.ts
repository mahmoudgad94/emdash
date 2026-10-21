import type { Result } from '@emdash/shared';

/** A failed Core call: Core's own error code, or a local transport/identity code. */
export type CoreLinkError = { code: string; message: string };

export type CoreInvokeOptions = { signal?: AbortSignal; timeoutMs?: number };

/**
 * The Node-side seam other slices use to call Client Ops Core tools. Slices depend on this
 * interface, never on the HTTP/2 implementation under `node/`.
 */
export interface CoreInvoker {
  invoke(
    tool: string,
    input: unknown,
    options?: CoreInvokeOptions
  ): Promise<Result<unknown, CoreLinkError>>;
}
