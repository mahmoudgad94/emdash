import { ok } from '@emdash/shared';
import { createTestWire } from '@emdash/wire/testing';
import { describe, expect, it } from 'vitest';
import type { CoreInvoker } from '@core/features/clientops-core/api/node/core-invoker';
import { observedSessionsContract } from '../api/contract';
import { createObservedSessionsWireController } from './wire-controller';

describe('Observed sessions Wire controller', () => {
  it('serves the summary, a session list and a transcript read through Core', async () => {
    const core: CoreInvoker = {
      invoke: async (tool, input) => {
        if (tool === 'work.summary') {
          return ok({ total: 1, own: 0, activeNow: 0, active: [], clients: [] });
        }
        if (tool === 'work.list') {
          return ok({
            items: [
              {
                id: 's1',
                clientId: (input as { clientId: string | null }).clientId,
                host: 'local-mac',
                source: 'claude',
                startedAt: '2026-10-21T09:00:00.000Z',
              },
            ],
          });
        }
        return ok({
          id: (input as { id: string }).id,
          source: 'claude',
          host: 'local-mac',
          entries: [],
        });
      },
    };
    const wire = createTestWire(
      observedSessionsContract,
      createObservedSessionsWireController(core)
    );
    try {
      expect(await wire.client.summary(undefined)).toEqual({
        success: true,
        data: { total: 1, own: 0, activeNow: 0, active: [], clients: [] },
      });
      expect(await wire.client.list({ clientId: 'acme' })).toMatchObject({
        success: true,
        data: { items: [{ id: 's1', clientId: 'acme', host: 'local-mac', own: false }] },
      });
      expect(await wire.client.transcript({ id: 's1' })).toEqual({
        success: true,
        data: { id: 's1', source: 'claude', host: 'local-mac', truncated: false, entries: [] },
      });
    } finally {
      await wire.dispose();
    }
  });
});
