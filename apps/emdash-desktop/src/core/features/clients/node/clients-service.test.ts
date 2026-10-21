import { err, ok, type Result } from '@emdash/shared';
import { describe, expect, it } from 'vitest';
import type {
  CoreInvoker,
  CoreLinkError,
} from '@core/features/clientops-core/api/node/core-invoker';
import { listClients, readClientActivity } from './clients-service';

type Handler = (input: unknown) => Result<unknown, CoreLinkError>;

function core(handlers: Record<string, Handler>) {
  const calls: Array<{ tool: string; input: unknown }> = [];
  const invoker: CoreInvoker = {
    invoke: async (tool, input) => {
      calls.push({ tool, input });
      const handler = handlers[tool];
      return handler ? handler(input) : err({ code: 'not_found', message: tool });
    },
  };
  return { invoker, calls };
}

const failure = (code: string): Result<unknown, CoreLinkError> => err({ code, message: code });

describe('listClients', () => {
  it('lists clients and reads each one for its projects and repositories', async () => {
    const { invoker, calls } = core({
      'clients.list': () =>
        ok({
          items: [
            { id: 'c1', name: 'Acme', agreementKind: 'retainer', status: 'ready' },
            { id: 'c2', name: 'Globex', agreementKind: null },
          ],
          truncated: false,
        }),
      'clients.get': (input) =>
        ok(
          (input as { id: string }).id === 'c1'
            ? {
                revision: 3,
                document: {
                  label: 'Acme',
                  projects: [
                    {
                      id: 'p1',
                      name: 'Site',
                      repos: ['/Users/me/acme/site', 'git@github.com:a/s.git'],
                    },
                    { id: 'p2', name: 'API' },
                  ],
                },
              }
            : { document: null }
        ),
    });

    const result = await listClients(invoker);

    expect(result).toEqual({
      success: true,
      data: {
        clients: [
          {
            id: 'c1',
            name: 'Acme',
            agreement: 'retainer',
            projects: [
              { id: 'p1', name: 'Site', repos: ['/Users/me/acme/site', 'git@github.com:a/s.git'] },
              { id: 'p2', name: 'API', repos: [] },
            ],
          },
          { id: 'c2', name: 'Globex', agreement: null, projects: [] },
        ],
      },
    });
    expect(calls.filter((c) => c.tool === 'clients.get').map((c) => c.input)).toEqual([
      { id: 'c1' },
      { id: 'c2' },
    ]);
  });

  it('follows pages until Core stops truncating', async () => {
    const pages: unknown[] = [
      {
        items: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
        truncated: true,
      },
      { items: [{ id: 'c', name: 'C' }], truncated: false },
    ];
    const { invoker, calls } = core({
      'clients.list': () => ok(pages.shift()),
      'clients.get': () => ok({ document: null }),
    });
    const result = await listClients(invoker);
    expect(result.success && result.data.clients.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(calls.filter((c) => c.tool === 'clients.list').map((c) => c.input)).toEqual([
      {},
      { after: 'b' },
    ]);
  });

  it('treats a client without configuration as having no projects', async () => {
    const { invoker } = core({
      'clients.list': () => ok({ items: [{ id: 'a', name: 'A' }] }),
      'clients.get': () => failure('not_found'),
    });
    expect(await listClients(invoker)).toMatchObject({
      success: true,
      data: { clients: [{ id: 'a', projects: [] }] },
    });
  });

  it('fails as a whole when Core is refused or answers nonsense', async () => {
    expect(
      await listClients(core({ 'clients.list': () => failure('unreachable') }).invoker)
    ).toEqual({
      success: false,
      error: { code: 'unreachable', message: 'unreachable' },
    });
    expect(
      await listClients(core({ 'clients.list': () => ok({ nope: 1 }) }).invoker)
    ).toMatchObject({
      success: false,
      error: { code: 'invalid_response' },
    });
    const denied = core({
      'clients.list': () => ok({ items: [{ id: 'a', name: 'A' }] }),
      'clients.get': () => failure('policy_denied'),
    });
    expect(await listClients(denied.invoker)).toMatchObject({
      success: false,
      error: { code: 'policy_denied' },
    });
  });
});

describe('readClientActivity', () => {
  it('maps work.summary to live sessions per client and ignores unmatched work', async () => {
    const { invoker, calls } = core({
      'work.summary': () =>
        ok({
          total: 9,
          own: 2,
          activeNow: 3,
          active: [],
          clients: [
            { clientId: 'c1', clientName: 'Acme', count: 5, active: 2 },
            { clientId: 'c2', clientName: 'Globex', count: 1, active: 0 },
            { clientId: null, clientName: null, count: 1, active: 1 },
          ],
        }),
    });
    expect(await readClientActivity(invoker)).toEqual({
      success: true,
      data: { activeNow: 3, byClient: { c1: 2, c2: 0 } },
    });
    expect(calls).toEqual([{ tool: 'work.summary', input: {} }]);
  });

  it('passes on Core refusing the summary to an assistant identity', async () => {
    const { invoker } = core({ 'work.summary': () => failure('policy_denied') });
    expect(await readClientActivity(invoker)).toMatchObject({
      success: false,
      error: { code: 'policy_denied' },
    });
  });
});
