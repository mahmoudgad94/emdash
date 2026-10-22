import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { err, ok, type Result } from '@emdash/shared';
import type { CoreLinkError } from '@core/features/clientops-core/api/node/core-invoker';

export const APPROVAL_APP_NAME = 'ClientOps';
const OPEN_TIMEOUT_MS = 10_000;
/** The Mac app's own link to its Need you screen, where a draft is approved and sent. */
export const NEED_YOU_LINK = 'clientops://need-you';

export type OpenApprovalApp = () => Promise<Result<{ opened: true }, CoreLinkError>>;

export type ApprovalAppHost = {
  platform: NodeJS.Platform;
  home: string;
  exists(path: string): Promise<boolean>;
  /** Runs `open` with these arguments; rejects with the reason when it fails. */
  open(args: readonly string[]): Promise<void>;
};

/** Where the Client Ops Mac app is installed, in the order it is looked for. */
export function approvalAppCandidates(home: string): string[] {
  return [
    join(home, 'Applications', `${APPROVAL_APP_NAME}.app`),
    `/Applications/${APPROVAL_APP_NAME}.app`,
  ];
}

/**
 * Opens the Client Ops Mac app on Need you, the only place a draft can be approved and sent (it
 * needs Touch ID). The installed bundle is opened by path with its link; if neither location has
 * it, `open -a ClientOps` lets macOS look the app up by name before this gives up.
 */
export function createApprovalAppOpener(host: ApprovalAppHost): OpenApprovalApp {
  return async () => {
    if (host.platform !== 'darwin') {
      return err({
        code: 'unsupported_platform',
        message: 'The Client Ops Mac app only runs on macOS',
      });
    }
    let found: string | undefined;
    for (const candidate of approvalAppCandidates(host.home)) {
      if (await host.exists(candidate)) {
        found = candidate;
        break;
      }
    }
    try {
      await host.open(['-a', found ?? APPROVAL_APP_NAME, NEED_YOU_LINK]);
      return ok({ opened: true });
    } catch (error) {
      return err(
        found
          ? {
              code: 'open_failed',
              message: error instanceof Error ? error.message : 'Could not open the app',
            }
          : { code: 'app_not_found', message: 'The Client Ops Mac app is not installed' }
      );
    }
  };
}

export const openApprovalApp: OpenApprovalApp = createApprovalAppOpener({
  platform: process.platform,
  home: homedir(),
  exists: async (path) => {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  open: (args) =>
    new Promise<void>((resolve, reject) => {
      execFile('/usr/bin/open', [...args], { timeout: OPEN_TIMEOUT_MS }, (error) =>
        error ? reject(error) : resolve()
      );
    }),
});
