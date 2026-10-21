import { ok } from '@emdash/shared';
import { createTestWire } from '@emdash/wire/testing';
import { describe, expect, it } from 'vitest';
import type { CoreInvoker } from '@core/features/clientops-core/api/node/core-invoker';
import { clientsContract } from '../api/contract';
import { createClientsWireController } from './wire-controller';

describe('Clients Wire controller', () => {
  it('serves the client list and live activity read through Core', async () => {
    const core: CoreInvoker = {
      invoke: async (tool) => {
        if (tool === 'clients.list') return ok({ items: [{ id: 'c1', name: 'Acme' }] });
        if (tool === 'clients.get') return ok({ document: { projects: [{ id: 'p', name: 'P' }] } });
        return ok({ activeNow: 1, clients: [{ clientId: 'c1', active: 1 }] });
      },
    };
    const wire = createTestWire(clientsContract, createClientsWireController(core));
    try {
      expect(await wire.client.list(undefined)).toEqual({
        success: true,
        data: {
          clients: [
            {
              id: 'c1',
              name: 'Acme',
              agreement: null,
              projects: [{ id: 'p', name: 'P', repos: [] }],
            },
          ],
        },
      });
      expect(await wire.client.activity(undefined)).toEqual({
        success: true,
        data: { activeNow: 1, byClient: { c1: 1 } },
      });
    } finally {
      await wire.dispose();
    }
  });
});
