import { err, ok, type Result } from '@emdash/shared';
import { describe, expect, it } from 'vitest';
import type {
  CoreInvoker,
  CoreLinkError,
} from '@core/features/clientops-core/api/node/core-invoker';
import { listSessions, readTranscript, readWorkSummary } from './observed-sessions-service';

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

describe('listSessions', () => {
  it("asks Core for a client's sessions and maps them without the log path", async () => {
    const { invoker, calls } = core({
      'work.list': () =>
        ok({
          items: [
            {
              id: 'a'.repeat(64),
              clientId: 'acme',
              projectId: 'site',
              status: 'observed',
              host: 'ssh-dev',
              source: 'codex',
              startedAt: '2026-10-21T09:00:00.000Z',
              endedAt: '2026-10-21T09:30:00.000Z',
              branch: 'main',
              toolCalls: 12,
              filesTouched: 4,
              commits: [{ hash: 'b'.repeat(40), subject: 'Fix header' }],
              locator: '/home/dev/.codex/sessions/secret.jsonl',
            },
            {
              id: 'c'.repeat(64),
              clientId: null,
              projectId: null,
              status: 'observed',
              host: 'local-mac',
              source: 'claude',
              startedAt: '2026-10-21T10:00:00.000Z',
              own: true,
            },
          ],
        }),
    });

    const result = await listSessions(invoker, { clientId: 'acme' });

    expect(calls).toEqual([{ tool: 'work.list', input: { clientId: 'acme', limit: 200 } }]);
    expect(result).toEqual({
      success: true,
      data: {
        items: [
          {
            id: 'a'.repeat(64),
            clientId: 'acme',
            projectId: 'site',
            status: 'observed',
            host: 'ssh-dev',
            source: 'codex',
            startedAt: '2026-10-21T09:00:00.000Z',
            endedAt: '2026-10-21T09:30:00.000Z',
            branch: 'main',
            toolCalls: 12,
            filesTouched: 4,
            commits: [{ hash: 'b'.repeat(40), subject: 'Fix header' }],
            own: false,
          },
          {
            id: 'c'.repeat(64),
            clientId: null,
            projectId: null,
            status: 'observed',
            host: 'local-mac',
            source: 'claude',
            startedAt: '2026-10-21T10:00:00.000Z',
            endedAt: null,
            branch: null,
            toolCalls: null,
            filesTouched: null,
            commits: [],
            own: true,
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret.jsonl');
  });

  it("passes null and own through for Unmatched and the owner's projects", async () => {
    const { invoker, calls } = core({ 'work.list': () => ok({ items: [] }) });
    await listSessions(invoker, { clientId: null });
    await listSessions(invoker, { clientId: null, own: true });
    expect(calls.map((c) => c.input)).toEqual([
      { clientId: null, limit: 200 },
      { clientId: null, limit: 200, own: true },
    ]);
  });

  it('passes on a Core refusal and rejects an unexpected answer', async () => {
    expect(
      await listSessions(core({ 'work.list': () => failure('policy_denied') }).invoker, {
        clientId: 'a',
      })
    ).toEqual({
      success: false,
      error: { code: 'policy_denied', message: 'policy_denied' },
    });
    expect(
      await listSessions(core({ 'work.list': () => ok({ items: [{ id: 1 }] }) }).invoker, {
        clientId: 'a',
      })
    ).toMatchObject({ success: false, error: { code: 'invalid_response' } });
  });
});

describe('readWorkSummary', () => {
  it('maps counts per client and the sessions live now', async () => {
    const { invoker, calls } = core({
      'work.summary': () =>
        ok({
          total: 9,
          own: 2,
          activeNow: 1,
          active: [
            {
              id: 'x',
              clientId: 'acme',
              clientName: 'Acme',
              own: false,
              host: 'ssh-dev',
              source: 'claude',
              branch: null,
              toolCalls: 3,
              endedAt: '2026-10-21T10:00:00.000Z',
            },
          ],
          clients: [
            { clientId: 'acme', clientName: 'Acme', count: 5, active: 1 },
            { clientId: null, clientName: null, count: 2, active: 0 },
          ],
        }),
    });
    expect(await readWorkSummary(invoker)).toEqual({
      success: true,
      data: {
        total: 9,
        own: 2,
        activeNow: 1,
        active: [
          {
            id: 'x',
            clientId: 'acme',
            clientName: 'Acme',
            own: false,
            host: 'ssh-dev',
            source: 'claude',
            branch: null,
            toolCalls: 3,
            endedAt: '2026-10-21T10:00:00.000Z',
          },
        ],
        clients: [
          { clientId: 'acme', clientName: 'Acme', count: 5, active: 1 },
          { clientId: null, clientName: null, count: 2, active: 0 },
        ],
      },
    });
    expect(calls).toEqual([{ tool: 'work.summary', input: {} }]);
  });

  it('treats an empty answer as nothing captured and passes on refusals', async () => {
    expect(await readWorkSummary(core({ 'work.summary': () => ok({}) }).invoker)).toEqual({
      success: true,
      data: { total: 0, own: 0, activeNow: 0, active: [], clients: [] },
    });
    expect(
      await readWorkSummary(core({ 'work.summary': () => failure('unreachable') }).invoker)
    ).toMatchObject({
      success: false,
      error: { code: 'unreachable' },
    });
    expect(
      await readWorkSummary(core({ 'work.summary': () => ok({ clients: 'no' }) }).invoker)
    ).toMatchObject({
      success: false,
      error: { code: 'invalid_response' },
    });
  });
});

describe('readTranscript', () => {
  it('reads a conversation through work.transcript', async () => {
    const entries = [
      { key: '1:1', role: 'user', text: 'Fix the header', at: '2026-10-21T09:00:00.000Z' },
      { key: '1:2', role: 'tool', tool: { name: 'Edit', summary: 'src/header.tsx' } },
      { key: '1:3', role: 'assistant', text: 'Done.' },
    ];
    const { invoker, calls } = core({
      'work.transcript': () =>
        ok({ id: 'a'.repeat(64), source: 'claude', host: 'local-mac', truncated: true, entries }),
    });
    expect(await readTranscript(invoker, 'a'.repeat(64))).toEqual({
      success: true,
      data: { id: 'a'.repeat(64), source: 'claude', host: 'local-mac', truncated: true, entries },
    });
    expect(calls).toEqual([{ tool: 'work.transcript', input: { id: 'a'.repeat(64) } }]);
  });

  it('defaults truncated to false and passes on "unavailable"', async () => {
    const { invoker } = core({
      'work.transcript': () => ok({ id: 'i', source: 'codex', host: 'ssh-dev', entries: [] }),
    });
    expect(await readTranscript(invoker, 'i')).toMatchObject({
      success: true,
      data: { truncated: false, entries: [] },
    });
    expect(
      await readTranscript(core({ 'work.transcript': () => failure('invalid_input') }).invoker, 'i')
    ).toMatchObject({ success: false, error: { code: 'invalid_input' } });
    expect(
      await readTranscript(
        core({
          'work.transcript': () =>
            ok({ id: 'i', source: 'x', host: 'h', entries: [{ key: 'k', role: 'robot' }] }),
        }).invoker,
        'i'
      )
    ).toMatchObject({ success: false, error: { code: 'invalid_response' } });
  });
});
