import { describe, expect, it } from 'vitest';
import type { Client } from '@core/features/clients/api/schemas';
import type { ConversationSummary, Draft } from '@core/features/messaging/api/schemas';
import type { LiveSession } from '@core/features/observed-sessions/api/schemas';
import { buildToday, hostLabel, summarizeToday } from './today-model';

const conversation = (
  id: string,
  over: Partial<ConversationSummary> & {
    sender?: string;
    clientId?: string;
    clientName?: string;
  } = {}
): ConversationSummary => ({
  id,
  provider: 'whatsapp',
  lastSeq: 1,
  lastMessage: {
    text: 'hello',
    at: '2026-01-01T10:00:00.000Z',
    sender: over.sender ?? 'Ari',
    senderRef: 'x',
  },
  messageCount: 3,
  untriagedCount: 0,
  heldCount: 0,
  source: {
    clientId: over.clientId ?? 'c1',
    clientName: over.clientName ?? 'Acme',
    projectId: 'p',
    projectName: 'Site',
    channelId: `ch-${id}`,
    channel: `chan-${id}`,
    account: 'acct',
    context: 'private',
  },
  connector: { state: 'healthy', lastEventAt: null },
  ...over,
});

const client = (id: string, name: string, status: 'active' | 'inactive' = 'active'): Client => ({
  id,
  name,
  agreement: 'retainer',
  status,
  dashboardRef: null,
  projects: [],
  people: [],
  channels: [],
});

const session = (
  id: string,
  clientId: string | null,
  endedAt: string,
  own = false
): LiveSession => ({
  id,
  clientId,
  clientName: clientId === null ? null : 'Acme',
  own,
  host: 'ssh-devserver',
  source: 'claude',
  branch: 'main',
  toolCalls: 4,
  endedAt,
});

describe('buildToday', () => {
  it('lists conversations that need the owner, newest first, and leaves quiet ones out', () => {
    const model = buildToday({
      conversations: [
        conversation('a', { untriagedCount: 2, lastSeq: 5 }),
        conversation('b', { untriagedCount: 1, lastSeq: 9, clientName: 'Zed' }),
        conversation('quiet', { untriagedCount: 0 }),
      ],
      drafts: [],
      sessions: [],
      clients: [],
      unlinked: [],
    });
    expect(model.needsYou.map((item) => item.conversationId)).toEqual(['b', 'a']);
    expect(model.needsYou[1]).toMatchObject({ from: 'Ari, WhatsApp', waiting: 2 });
  });

  it('counts held strangers only in conversations that do not need the owner', () => {
    const model = buildToday({
      conversations: [
        conversation('stranger', {
          sender: 'Unrecognized sender',
          untriagedCount: 26,
          heldCount: 26,
        }),
        conversation('real', { untriagedCount: 2, heldCount: 1 }),
      ],
      drafts: [],
      sessions: [],
      clients: [],
      unlinked: [],
    });
    expect(model.needsYou.map((item) => item.conversationId)).toEqual(['real']);
    expect(model.heldStrangers).toBe(26);
  });

  it("orders live sessions newest first and names the owner's own work", () => {
    const model = buildToday({
      conversations: [],
      drafts: [],
      sessions: [
        session('old', 'c1', '2026-01-01T10:00:00.000Z'),
        session('mine', null, '2026-01-01T11:00:00.000Z', true),
      ],
      clients: [],
      unlinked: [],
    });
    expect(model.live.map((item) => [item.id, item.clientName])).toEqual([
      ['mine', 'Your projects'],
      ['old', 'Acme'],
    ]);
  });

  it('shows active clients only, those that need you first', () => {
    const model = buildToday({
      conversations: [conversation('a', { untriagedCount: 2, clientId: 'c2', clientName: 'Beta' })],
      drafts: [],
      sessions: [session('s', 'c1', '2026-01-01T10:00:00.000Z')],
      clients: [client('c1', 'Acme'), client('c2', 'Beta'), client('c3', 'Gone', 'inactive')],
      unlinked: [{ ref: 'cl-9', name: 'Zed Ltd' }],
    });
    expect(model.clients.map((card) => [card.name, card.waiting, card.live])).toEqual([
      ['Beta', 2, 0],
      ['Acme', 0, 1],
    ]);
    expect(model.unlinked).toBe(1);
  });
});

describe('summarizeToday', () => {
  it('says plainly what needs the owner and what is running', () => {
    const draft = { id: 'd' } as Draft;
    const model = buildToday({
      conversations: [conversation('a', { untriagedCount: 1 })],
      drafts: [draft],
      sessions: [session('s', 'c1', '2026-01-01T10:00:00.000Z')],
      clients: [],
      unlinked: [],
    });
    expect(summarizeToday(model)).toBe('2 things need you. 1 session is running.');
  });

  it('reports quiet days', () => {
    const model = buildToday({
      conversations: [],
      drafts: [],
      sessions: [],
      clients: [],
      unlinked: [],
    });
    expect(summarizeToday(model)).toBe('Nothing needs you. No sessions are running.');
  });
});

describe('hostLabel', () => {
  it('names machines for the owner', () => {
    expect(hostLabel('local-mac')).toBe('This Mac');
    expect(hostLabel('ssh-devserver')).toBe('devserver');
  });
});
