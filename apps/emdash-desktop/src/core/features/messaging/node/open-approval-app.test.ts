import { describe, expect, it } from 'vitest';
import {
  approvalAppCandidates,
  createApprovalAppOpener,
  type ApprovalAppHost,
} from './open-approval-app';

function host(overrides: Partial<ApprovalAppHost> & { installed?: string[] } = {}) {
  const opened: Array<readonly string[]> = [];
  const { installed = [], ...rest } = overrides;
  const fake: ApprovalAppHost = {
    platform: 'darwin',
    home: '/Users/me',
    exists: async (path) => installed.includes(path),
    open: async (args) => {
      opened.push(args);
    },
    ...rest,
  };
  return { fake, opened };
}

describe('approvalAppCandidates', () => {
  it('looks in the user Applications folder first', () => {
    expect(approvalAppCandidates('/Users/me')).toEqual([
      '/Users/me/Applications/ClientOps.app',
      '/Applications/ClientOps.app',
    ]);
  });
});

describe('createApprovalAppOpener', () => {
  it('opens the installed app by path', async () => {
    const { fake, opened } = host({ installed: ['/Users/me/Applications/ClientOps.app'] });
    expect(await createApprovalAppOpener(fake)()).toEqual({
      success: true,
      data: { opened: true },
    });
    expect(opened).toEqual([['/Users/me/Applications/ClientOps.app']]);
  });

  it('falls back to the system-wide Applications folder', async () => {
    const { fake, opened } = host({ installed: ['/Applications/ClientOps.app'] });
    await createApprovalAppOpener(fake)();
    expect(opened).toEqual([['/Applications/ClientOps.app']]);
  });

  it('lets macOS find the app by name when neither folder has it', async () => {
    const { fake, opened } = host();
    await createApprovalAppOpener(fake)();
    expect(opened).toEqual([['-a', 'ClientOps']]);
  });

  it('reports the app as missing when macOS cannot find it either', async () => {
    const { fake } = host({
      open: async () => {
        throw new Error('Unable to find application named ClientOps');
      },
    });
    expect(await createApprovalAppOpener(fake)()).toMatchObject({
      success: false,
      error: { code: 'app_not_found' },
    });
  });

  it('reports a failed launch of an installed app', async () => {
    const { fake } = host({
      installed: ['/Applications/ClientOps.app'],
      open: async () => {
        throw new Error('launch failed');
      },
    });
    expect(await createApprovalAppOpener(fake)()).toEqual({
      success: false,
      error: { code: 'open_failed', message: 'launch failed' },
    });
  });

  it('refuses outside macOS without trying to open anything', async () => {
    const { fake, opened } = host({ platform: 'linux' });
    expect(await createApprovalAppOpener(fake)()).toMatchObject({
      success: false,
      error: { code: 'unsupported_platform' },
    });
    expect(opened).toEqual([]);
  });
});
