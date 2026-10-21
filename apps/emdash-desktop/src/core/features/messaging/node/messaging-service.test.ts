import { err, ok, type Result } from '@emdash/shared';
import { describe, expect, it } from 'vitest';
import type {
  CoreInvoker,
  CoreLinkError,
} from '@core/features/clientops-core/api/node/core-invoker';
import { createDraft, listConversations, listNeedYou, readConversation } from './messaging-service';

type Handler = (input: Record<string, unknown>) => Result<unknown, CoreLinkError>;

function core(handlers: Record<string, Handler>) {
  const calls: Array<{ tool: string; input: Record<string, unknown> }> = [];
  const invoker: CoreInvoker = {
    invoke: async (tool, input) => {
      const body = input as Record<string, unknown>;
      calls.push({ tool, input: body });
      const handler = handlers[tool];
      return handler ? handler(body) : err({ code: 'not_found', message: tool });
    },
  };
  return { invoker, calls };
}

const denied = (): Result<unknown, CoreLinkError> =>
  err({ code: 'policy_denied', message: 'policy_denied' });

const source = {
  clientId: 'acme',
  clientName: 'Acme',
  projectId: 'site',
  projectName: 'Website',
  channelId: 'ch-1',
  channel: '351912345678@s.whatsapp.net',
  account: '351900000000@s.whatsapp.net',
  context: 'private',
};

const coreConversation = (id: string, lastSeq: number) => ({
  id,
  provider: 'whatsapp',
  lastSeq,
  lastMessage: { text: 'Hi', at: '2026-10-21T09:00:00.000Z', sender: 'Dana', senderRef: 'r' },
  messageCount: 2,
  untriagedCount: 1,
  heldCount: 0,
  source,
  history: { coverage: 'captured_ledger', partial: true, partialReasons: [] },
  connector: { state: 'healthy', lastEventAt: '2026-10-21T09:01:00.000Z' },
});

describe('listConversations', () => {
  it('maps a Core page into conversations', async () => {
    const { invoker, calls } = core({
      'inbox.conversations': () =>
        ok({
          snapshotSeq: 9,
          conversations: [coreConversation('cv1.a', 9)],
          hasMore: false,
          nextAfterSeq: null,
        }),
    });
    const result = await listConversations(invoker, {});
    expect(result).toEqual({
      success: true,
      data: {
        truncated: false,
        conversations: [
          {
            id: 'cv1.a',
            provider: 'whatsapp',
            lastSeq: 9,
            lastMessage: {
              text: 'Hi',
              at: '2026-10-21T09:00:00.000Z',
              sender: 'Dana',
              senderRef: 'r',
            },
            messageCount: 2,
            untriagedCount: 1,
            heldCount: 0,
            source,
            connector: { state: 'healthy', lastEventAt: '2026-10-21T09:01:00.000Z' },
          },
        ],
      },
    });
    expect(calls[0]!.input).toEqual({ limit: 200 });
  });

  it('keeps a missing account as null so replying stays disabled', async () => {
    const { account: _account, ...noAccount } = source;
    const { invoker } = core({
      'inbox.conversations': () =>
        ok({
          snapshotSeq: 1,
          conversations: [{ ...coreConversation('cv1.a', 1), source: noAccount }],
          hasMore: false,
        }),
    });
    const result = await listConversations(invoker, {});
    expect(result.success && result.data.conversations[0]!.source.account).toBeNull();
  });

  it('follows the cursor under the first snapshot and filters by client', async () => {
    const { invoker, calls } = core({
      'inbox.conversations': (input) =>
        input.afterSeq === undefined
          ? ok({
              snapshotSeq: 50,
              conversations: [coreConversation('cv1.a', 40)],
              hasMore: true,
              nextAfterSeq: 40,
            })
          : ok({
              snapshotSeq: 50,
              conversations: [coreConversation('cv1.b', 10)],
              hasMore: false,
              nextAfterSeq: null,
            }),
    });
    const result = await listConversations(invoker, { clientId: 'acme' });
    expect(result.success && result.data.conversations.map((c) => c.id)).toEqual([
      'cv1.a',
      'cv1.b',
    ]);
    expect(calls.map((c) => c.input)).toEqual([
      { limit: 200, clientId: 'acme' },
      { limit: 200, clientId: 'acme', afterSeq: 40, snapshotSeq: 50 },
    ]);
  });

  it('marks the list truncated when Core still has more after three pages', async () => {
    const { invoker, calls } = core({
      'inbox.conversations': (input) =>
        ok({
          snapshotSeq: 900,
          conversations: [coreConversation(`cv1.${String(input.afterSeq ?? 'first')}`, 1)],
          hasMore: true,
          nextAfterSeq: Number(input.afterSeq ?? 800) - 100,
        }),
    });
    const result = await listConversations(invoker, {});
    expect(result.success && result.data.truncated).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it('passes a Core refusal through with its code', async () => {
    const { invoker } = core({ 'inbox.conversations': denied });
    expect(await listConversations(invoker, {})).toEqual({
      success: false,
      error: { code: 'policy_denied', message: 'policy_denied' },
    });
  });

  it('reports an unreadable answer', async () => {
    const { invoker } = core({ 'inbox.conversations': () => ok({ nope: true }) });
    const result = await listConversations(invoker, {});
    expect(!result.success && result.error.code).toBe('invalid_response');
  });
});

const row = (seq: number, overrides: Record<string, unknown> = {}) => ({
  seq,
  kind: 'message',
  at: `2026-10-21T09:0${seq}:00.000Z`,
  senderLabel: 'Dana',
  senderRef: 'r',
  held: false,
  heldReason: null,
  superseded: false,
  text: `m${seq}`,
  attachments: [],
  ...overrides,
});

const detail = (rows: unknown[], extra: Record<string, unknown> = {}) => ({
  conversationId: 'cv1.a',
  snapshotSeq: 20,
  highwaterSeq: 5,
  afterSeq: 0,
  rows,
  hasMore: false,
  nextAfterSeq: null,
  source: { ...source, provider: 'whatsapp' },
  ...extra,
});

describe('readConversation', () => {
  it('reads the messages oldest first and leaves out old versions and deleted messages', async () => {
    const { invoker, calls } = core({
      'inbox.conversation': () =>
        ok(
          detail([
            row(1),
            row(2, { superseded: true }),
            row(3, { kind: 'edit', text: 'fixed', attachments: [{ name: 'a.pdf' }] }),
            row(4, { kind: 'delete' }),
            row(5, { held: true, heldReason: 'quarantined' }),
          ])
        ),
    });
    const result = await readConversation(invoker, 'cv1.a');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({ id: 'cv1.a', provider: 'whatsapp', truncated: false });
    expect(result.data.messages.map((m) => [m.seq, m.text, m.edited, m.heldReason])).toEqual([
      [1, 'm1', false, null],
      [3, 'fixed', true, null],
      [5, 'm5', false, 'quarantined'],
    ]);
    expect(result.data.messages[1]!.attachments).toEqual(['a.pdf']);
    expect(calls[0]!.input).toEqual({ conversationId: 'cv1.a', limit: 200 });
  });

  it('follows the cursor under the first snapshot', async () => {
    const { invoker, calls } = core({
      'inbox.conversation': (input) =>
        input.afterSeq === undefined
          ? ok(detail([row(1)], { hasMore: true, nextAfterSeq: 1 }))
          : ok(detail([row(2)])),
    });
    const result = await readConversation(invoker, 'cv1.a');
    expect(result.success && result.data.messages.map((m) => m.seq)).toEqual([1, 2]);
    expect(calls[1]!.input).toEqual({
      conversationId: 'cv1.a',
      limit: 200,
      afterSeq: 1,
      snapshotSeq: 20,
    });
  });

  it('marks a very long thread truncated after ten pages', async () => {
    const { invoker, calls } = core({
      'inbox.conversation': (input) =>
        ok(
          detail([row(Number(input.afterSeq ?? 0) + 1)], {
            hasMore: true,
            nextAfterSeq: Number(input.afterSeq ?? 0) + 1,
          })
        ),
    });
    const result = await readConversation(invoker, 'cv1.a');
    expect(result.success && result.data.truncated).toBe(true);
    expect(calls).toHaveLength(10);
  });

  it('passes a not_found refusal through', async () => {
    const { invoker } = core({});
    expect(await readConversation(invoker, 'cv1.gone')).toMatchObject({
      success: false,
      error: { code: 'not_found' },
    });
  });
});

const actionRow = (id: string, state = 'drafted') => ({
  id,
  kind: 'send',
  channelKey: 'k',
  state,
  revision: 1,
  payload: {
    provider: 'whatsapp',
    account: source.account,
    channel: source.channel,
    recipients: [source.channel],
    text: 'On it.',
    attachments: [],
    draftRevision: 1,
    inboundWatermark: 4,
    policyVersion: 'p1-abc',
  },
});

describe('createDraft', () => {
  const input = {
    provider: 'whatsapp',
    account: source.account,
    channel: source.channel,
    text: '  On it.  ',
  };

  it('sends the exact draft payload to actions.create_send and returns the drafted action', async () => {
    const { invoker, calls } = core({ 'actions.create_send': () => ok(actionRow('d1')) });
    const result = await createDraft(invoker, input);
    expect(calls).toEqual([
      {
        tool: 'actions.create_send',
        input: {
          provider: 'whatsapp',
          account: source.account,
          channel: source.channel,
          recipients: [source.channel],
          text: 'On it.',
          attachments: [],
          draftRevision: 0,
          inboundWatermark: 0,
          policyVersion: 'core-assigns',
        },
      },
    ]);
    expect(result).toEqual({
      success: true,
      data: {
        id: 'd1',
        state: 'drafted',
        provider: 'whatsapp',
        account: source.account,
        channel: source.channel,
        text: 'On it.',
        attachmentCount: 0,
        revision: 1,
        createdAt: null,
      },
    });
  });

  it('surfaces policy_denied from Core', async () => {
    const { invoker } = core({ 'actions.create_send': denied });
    expect(await createDraft(invoker, input)).toEqual({
      success: false,
      error: { code: 'policy_denied', message: 'policy_denied' },
    });
  });

  it('surfaces a paused channel from Core', async () => {
    const { invoker } = core({
      'actions.create_send': () => err({ code: 'paused', message: 'paused' }),
    });
    expect(await createDraft(invoker, input)).toMatchObject({
      success: false,
      error: { code: 'paused' },
    });
  });

  it('does not call Core for an empty reply or a provider that cannot be drafted', async () => {
    const { invoker, calls } = core({ 'actions.create_send': () => ok(actionRow('d1')) });
    expect(await createDraft(invoker, { ...input, text: '  ' })).toMatchObject({
      success: false,
      error: { code: 'invalid_input' },
    });
    expect(await createDraft(invoker, { ...input, provider: 'slack' })).toMatchObject({
      success: false,
      error: { code: 'unsupported_provider' },
    });
    expect(calls).toEqual([]);
  });
});

describe('listNeedYou', () => {
  it('lists the waiting drafts', async () => {
    const { invoker, calls } = core({
      'actions.need_you': () => ok([actionRow('d1'), actionRow('d2', 'awaiting_approval')]),
    });
    const result = await listNeedYou(invoker);
    expect(result.success && result.data.drafts.map((d) => [d.id, d.state])).toEqual([
      ['d1', 'drafted'],
      ['d2', 'awaiting_approval'],
    ]);
    expect(result.success && result.data.truncated).toBe(false);
    expect(calls[0]).toEqual({ tool: 'actions.need_you', input: { limit: 200 } });
  });

  it('follows the last id as the cursor while pages are full', async () => {
    const full = Array.from({ length: 200 }, (_, i) => actionRow(`d${i}`));
    const { invoker, calls } = core({
      'actions.need_you': (input) =>
        input.cursor === undefined ? ok(full) : ok([actionRow('last')]),
    });
    const result = await listNeedYou(invoker);
    expect(result.success && result.data.drafts).toHaveLength(201);
    expect(calls[1]!.input).toEqual({ limit: 200, cursor: 'd199' });
  });

  it('is empty when nothing waits', async () => {
    const { invoker } = core({ 'actions.need_you': () => ok([]) });
    expect(await listNeedYou(invoker)).toEqual({
      success: true,
      data: { drafts: [], truncated: false },
    });
  });

  it('surfaces policy_denied, which Core gives non-owner identities for this tool', async () => {
    const { invoker } = core({ 'actions.need_you': denied });
    expect(await listNeedYou(invoker)).toEqual({
      success: false,
      error: { code: 'policy_denied', message: 'policy_denied' },
    });
  });
});
