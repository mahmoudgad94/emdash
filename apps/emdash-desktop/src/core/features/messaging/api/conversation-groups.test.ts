import { describe, expect, it } from 'vitest';
import {
  compareByRecency,
  filterConversations,
  findConversation,
  flattenGroups,
  groupConversationsByClient,
} from './conversation-groups';
import { conversation } from './test-support';

const withClient = (
  id: string,
  clientId: string,
  clientName: string,
  lastSeq: number,
  untriaged = 0
) =>
  conversation({
    id,
    lastSeq,
    untriagedCount: untriaged,
    source: { ...conversation().source, clientId, clientName, channel: `ch-${id}` },
  });

const conversations = [
  withClient('a1', 'acme', 'Acme', 5, 1),
  withClient('g1', 'globex', 'Globex', 30),
  withClient('a2', 'acme', 'Acme', 20, 2),
  withClient('b1', 'beta', 'Beta', 9),
];

describe('groupConversationsByClient', () => {
  const groups = groupConversationsByClient(conversations);

  it('lists clients by name so the list does not reshuffle', () => {
    expect(groups.map((group) => group.clientName)).toEqual(['Acme', 'Beta', 'Globex']);
  });

  it('puts the most recent conversation of a client first', () => {
    expect(groups[0]!.conversations.map((c) => c.id)).toEqual(['a2', 'a1']);
  });

  it('adds up the untriaged messages of a client', () => {
    expect(groups.map((group) => group.untriaged)).toEqual([3, 0, 0]);
  });

  it('is empty for no conversations', () => {
    expect(groupConversationsByClient([])).toEqual([]);
  });
});

describe('compareByRecency', () => {
  it('orders by last sequence, newest first, and breaks ties by id', () => {
    const sorted = [
      { id: 'b', lastSeq: 1 },
      { id: 'a', lastSeq: 1 },
      { id: 'c', lastSeq: 7 },
    ].sort(compareByRecency);
    expect(sorted.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('flattenGroups and findConversation', () => {
  const groups = groupConversationsByClient(conversations);

  it('lists conversations in the order the groups show them', () => {
    expect(flattenGroups(groups).map((c) => c.id)).toEqual(['a2', 'a1', 'b1', 'g1']);
  });

  it('finds a conversation by id and returns nothing for an unknown or missing id', () => {
    expect(findConversation(groups, 'b1')?.id).toBe('b1');
    expect(findConversation(groups, 'nope')).toBeUndefined();
    expect(findConversation(groups, undefined)).toBeUndefined();
  });
});

describe('filterConversations', () => {
  it('matches client, project, channel and the last message without regard to case', () => {
    expect(filterConversations(conversations, 'GLOBEX').map((c) => c.id)).toEqual(['g1']);
    expect(filterConversations(conversations, 'ch-b1').map((c) => c.id)).toEqual(['b1']);
    expect(filterConversations(conversations, 'invoice')).toHaveLength(4);
    expect(filterConversations(conversations, 'zzz')).toEqual([]);
  });

  it('returns everything for a blank query', () => {
    expect(filterConversations(conversations, '  ')).toBe(conversations);
  });
});
