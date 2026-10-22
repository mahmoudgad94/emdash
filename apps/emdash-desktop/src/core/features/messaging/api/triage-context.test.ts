import { describe, expect, it } from 'vitest';
import type { Client, ClientWork } from '@core/features/clients/api/schemas';
import type { ConversationSummary, Draft, ThreadMessage } from './schemas';
import { buildTriageContext } from './triage-context';

const client: Client = {
  id: 'c1',
  name: 'FriendsApp',
  agreement: 'per_task',
  status: 'active',
  dashboardRef: 'cl-2',
  projects: [
    {
      id: 'p1',
      name: 'FriendsApp',
      repos: ['/home/me/site', '/Users/me/work/Stephen', 'https://github.com/x/y.git'],
      environments: [],
    },
  ],
  people: [{ id: 'u', name: 'Stephen Ellis', role: 'contact' }],
  channels: [],
};

const conversation = {
  id: 'cv1',
  provider: 'whatsapp',
  lastSeq: 3,
  lastMessage: null,
  messageCount: 2,
  untriagedCount: 1,
  heldCount: 0,
  source: {
    clientId: 'c1',
    clientName: 'FriendsApp',
    projectId: 'p1',
    projectName: 'FriendsApp',
    channelId: 'ch',
    channel: 'chan',
    account: 'acct',
    context: 'private',
  },
  connector: { state: 'healthy', lastEventAt: null },
} as ConversationSummary;

const message = (
  sender: string,
  heldReason: ThreadMessage['heldReason'] = null
): ThreadMessage => ({
  seq: 1,
  at: null,
  sender,
  senderRef: 'r',
  text: `from ${sender}`,
  attachments: [],
  edited: false,
  heldReason,
});

describe('buildTriageContext', () => {
  it('names the client, its contacts and puts the checkouts on this Mac first', () => {
    const context = buildTriageContext({
      client,
      conversation,
      messages: [message('Stephen Ellis')],
      work: undefined,
      drafts: [],
    });
    expect(context).toMatchObject({
      clientName: 'FriendsApp',
      contacts: ['Stephen Ellis'],
      channel: 'WhatsApp',
      repos: ['/Users/me/work/Stephen', '/home/me/site', 'https://github.com/x/y.git'],
      business: [],
    });
  });

  it('drops held strangers but keeps a held registered contact', () => {
    const context = buildTriageContext({
      client,
      conversation,
      messages: [
        message('Unrecognized sender', 'quarantined'),
        message('Stephen Ellis', 'quarantined'),
        message('Stephen Ellis'),
      ],
      work: undefined,
      drafts: [],
    });
    expect(context.messages.map((m) => m.sender)).toEqual(['Stephen Ellis', 'Stephen Ellis']);
  });

  it('adds contracts and payments, and drafts waiting on this channel only', () => {
    const work: ClientWork = {
      linked: true,
      contracts: [{ ref: 'ct', label: 'Build', state: 'active', at: null }],
      payments: { count: 2, totalMinor: 50000, currency: 'USD', lastAt: null },
      asOf: null,
      stale: false,
    };
    const draft = (channel: string, text: string): Draft => ({
      id: text,
      state: 'drafted',
      provider: 'whatsapp',
      account: 'acct',
      channel,
      text,
      attachmentCount: 0,
      revision: 1,
      createdAt: null,
    });
    const context = buildTriageContext({
      client,
      conversation,
      messages: [],
      work,
      drafts: [draft('chan', 'mine'), draft('other', 'not mine')],
    });
    expect(context.business).toEqual(['Contract: Build (active)', '2 payments, $500.00']);
    expect(context.pendingDrafts).toEqual(['mine']);
  });
});
