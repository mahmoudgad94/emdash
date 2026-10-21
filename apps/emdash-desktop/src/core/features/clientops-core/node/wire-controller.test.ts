import { join } from 'node:path';
import { createStubLogger } from '@emdash/shared/testing';
import { createTestWire } from '@emdash/wire/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { clientOpsCoreContract } from '../api/contract';
import { createCoreLink } from './core-link';
import { makeTempDir } from './test-support';
import { createClientOpsCoreWireController } from './wire-controller';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe('Client Ops Core Wire controller', () => {
  it('exposes status, URL changes, import failures and disconnect through the contract', async () => {
    const temp = await makeTempDir();
    cleanups.push(temp.remove);
    const link = createCoreLink({
      userDataDir: join(temp.dir, 'userData'),
      logger: createStubLogger().logger,
    });
    cleanups.push(() => link.dispose());
    const wire = createTestWire(clientOpsCoreContract, createClientOpsCoreWireController(link));
    cleanups.push(() => wire.dispose());

    expect(await wire.client.getStatus(undefined)).toEqual({
      state: { kind: 'unconfigured' },
      coreUrl: 'https://localhost:28443',
    });
    expect(await wire.client.setCoreUrl({ coreUrl: 'ftp://nope' })).toMatchObject({
      success: false,
      error: { type: 'invalid_input' },
    });
    expect(await wire.client.importEnrollmentResult({ path: temp.dir })).toMatchObject({
      success: false,
      error: { type: 'no_pending_request' },
    });
    expect(await wire.client.disconnect(undefined)).toMatchObject({
      state: { kind: 'unconfigured' },
    });
  });
});
