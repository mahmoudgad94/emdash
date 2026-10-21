import { ok } from '@emdash/shared';
import { createTestWire } from '@emdash/wire/testing';
import { describe, expect, it } from 'vitest';
import type { CoreInvoker } from '@core/features/clientops-core/api/node/core-invoker';
import { clientsContract } from '../api/contract';
import { createClientsWireController } from './wire-controller';

describe('Clients Wire controller', () => {
  it('serves the client list, live activity, dashboard work and repository inspection', async () => {
    const core: CoreInvoker = {
      invoke: async (tool, input) => {
        if (tool === 'clients.list') return ok({ items: [{ id: 'c1', name: 'Acme' }] });
        if (tool === 'clients.get')
          return ok({
            document: {
              dashboardRef: { clientRef: 'cl-1' },
              projects: [{ id: 'p', name: 'P' }],
            },
          });
        if (tool === 'dashboard.read') {
          const { kind } = input as { kind: string };
          return ok({
            items:
              kind === 'payments'
                ? [
                    {
                      ref: 'dp-1',
                      label: 'dp-1',
                      state: 'paid',
                      amountMinor: 500,
                      currency: 'USD',
                      at: '2026-01-02T00:00:00.000Z',
                    },
                  ]
                : [
                    {
                      ref: 'ct-1',
                      label: 'Build',
                      state: 'active',
                      amountMinor: null,
                      currency: null,
                      at: null,
                    },
                  ],
            truncated: false,
            asOf: '2026-01-03T00:00:00.000Z',
            stale: false,
          });
        }
        return ok({ activeNow: 1, clients: [{ clientId: 'c1', active: 1 }] });
      },
    };
    const exists = async (path: string) => path === '/here/app';
    const wire = createTestWire(clientsContract, createClientsWireController(core, exists));
    try {
      expect(await wire.client.list(undefined)).toEqual({
        success: true,
        data: {
          clients: [
            {
              id: 'c1',
              name: 'Acme',
              agreement: null,
              status: 'active',
              dashboardRef: 'cl-1',
              projects: [{ id: 'p', name: 'P', repos: [], environments: [] }],
              people: [],
              channels: [],
            },
          ],
        },
      });
      expect(await wire.client.activity(undefined)).toEqual({
        success: true,
        data: { activeNow: 1, byClient: { c1: 1 } },
      });
      expect(await wire.client.work({ clientId: 'c1' })).toEqual({
        success: true,
        data: {
          linked: true,
          contracts: [{ ref: 'ct-1', label: 'Build', state: 'active', at: null }],
          payments: {
            count: 1,
            totalMinor: 500,
            currency: 'USD',
            lastAt: '2026-01-02T00:00:00.000Z',
          },
          asOf: '2026-01-03T00:00:00.000Z',
          stale: false,
        },
      });
      expect(
        await wire.client.inspectRepos({
          repos: ['/here/app', '/elsewhere/app', 'git@github.com:acme/app.git'],
        })
      ).toEqual({
        success: true,
        data: {
          repos: [
            { repo: '/here/app', kind: 'path', existsHere: true },
            { repo: '/elsewhere/app', kind: 'path', existsHere: false },
            {
              repo: 'git@github.com:acme/app.git',
              kind: 'url',
              existsHere: false,
            },
          ],
        },
      });
    } finally {
      await wire.dispose();
    }
  });
});
