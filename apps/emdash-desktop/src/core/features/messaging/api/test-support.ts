import type { ConversationSummary, Draft, ThreadMessage } from './schemas';

export function conversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'cv1.a',
    provider: 'whatsapp',
    lastSeq: 10,
    lastMessage: {
      text: 'Can you send the invoice?',
      at: '2026-10-21T09:30:00.000Z',
      sender: 'Dana',
      senderRef: 'ref-dana',
    },
    messageCount: 4,
    untriagedCount: 0,
    heldCount: 0,
    source: {
      clientId: 'acme',
      clientName: 'Acme',
      projectId: 'site',
      projectName: 'Website',
      channelId: 'ch-1',
      channel: '351912345678@s.whatsapp.net',
      account: '351900000000@s.whatsapp.net',
      context: 'private',
    },
    connector: { state: 'healthy', lastEventAt: '2026-10-21T09:31:00.000Z' },
    ...overrides,
  };
}

export function message(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    seq: 1,
    at: '2026-10-21T09:30:00.000Z',
    sender: 'Dana',
    senderRef: 'ref-dana',
    text: 'Hello',
    attachments: [],
    edited: false,
    heldReason: null,
    ...overrides,
  };
}

export function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: 'd1',
    state: 'drafted',
    provider: 'whatsapp',
    account: '351900000000@s.whatsapp.net',
    channel: '351912345678@s.whatsapp.net',
    text: 'On it.',
    attachmentCount: 0,
    revision: 1,
    createdAt: null,
    ...overrides,
  };
}
