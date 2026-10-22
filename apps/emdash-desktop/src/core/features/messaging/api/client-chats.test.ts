import { describe, expect, it } from 'vitest';
import type { Client } from '@core/features/clients/api/schemas';
import { isLocalConversation, localClientConversations } from './client-chats';
import type { ConversationSummary } from './schemas';

const client = (
  id: string,
  status: 'active' | 'inactive',
  channels: Client['channels']
): Client => ({
  id,
  name: id.toUpperCase(),
  agreement: null,
  status,
  dashboardRef: null,
  projects: [{ id: 'p', name: 'Site', repos: [], environments: [] }],
  people: [],
  channels,
});

const chan = (id: string, channel: string, provider = 'whatsapp') => ({
  id,
  projectId: 'p',
  provider,
  account: 'acct',
  channel,
  context: 'private',
});

describe('localClientConversations', () => {
  const clients = [
    client('a', 'active', [
      chan('ch1', '1@s.whatsapp.net'),
      chan('ch2', '2@s.whatsapp.net'),
      chan('sl', 'C1', 'slack'),
    ]),
    client('b', 'inactive', [chan('ch3', '3@s.whatsapp.net')]),
  ];
  const captured = [{ source: { channelId: 'ch1' } } as ConversationSummary];

  it("adds the active clients' WhatsApp chats Core has not captured, with their last message", () => {
    const local = localClientConversations(
      clients,
      captured,
      new Map([
        [
          '2@s.whatsapp.net',
          {
            id: 'm',
            at: '2026-10-01T10:00:00.000Z',
            fromMe: true,
            sender: 'You',
            text: 'Thanks',
            attachments: [],
          },
        ],
      ]),
      'healthy'
    );
    expect(local).toHaveLength(1);
    expect(local[0]).toMatchObject({
      id: 'local:ch2',
      lastMessage: { text: 'Thanks', sender: 'You', senderRef: 'me' },
      source: { clientName: 'A', channel: '2@s.whatsapp.net', projectName: 'Site' },
      connector: { state: 'healthy' },
    });
    expect(isLocalConversation(local[0]!.id)).toBe(true);
  });

  it('shows a chat without history as having no messages yet', () => {
    const local = localClientConversations(clients, captured, new Map(), null);
    expect(local[0]!.lastMessage).toBeNull();
  });
});
