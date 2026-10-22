import { UNRECOGNIZED_SENDER } from './labels';
import { replyState } from './reply-state';
import type { ConversationSummary } from './schemas';

export type ClientConversationGroup = {
  clientId: string;
  clientName: string;
  /** Most recently active first. */
  conversations: readonly ConversationSummary[];
  /** Messages in this client's conversations that no one has triaged yet. */
  untriaged: number;
};

/** Newest first: Core numbers events in arrival order, so a higher last sequence is more recent. */
export function compareByRecency(
  a: Pick<ConversationSummary, 'id' | 'lastSeq'>,
  b: Pick<ConversationSummary, 'id' | 'lastSeq'>
): number {
  return b.lastSeq - a.lastSeq || a.id.localeCompare(b.id);
}

/**
 * Conversations grouped under their client. Clients are listed by name so the list does not
 * reshuffle on every refresh; inside a client the most recent conversation comes first.
 */
export function groupConversationsByClient(
  conversations: readonly ConversationSummary[]
): ClientConversationGroup[] {
  const byClient = new Map<string, ConversationSummary[]>();
  for (const conversation of conversations) {
    const list = byClient.get(conversation.source.clientId) ?? [];
    list.push(conversation);
    byClient.set(conversation.source.clientId, list);
  }
  const groups = [...byClient.entries()].map(([clientId, list]) => {
    const sorted = [...list].sort(compareByRecency);
    return {
      clientId,
      clientName: sorted[0]!.source.clientName,
      conversations: sorted,
      untriaged: sorted.reduce((sum, conversation) => sum + conversation.untriagedCount, 0),
    };
  });
  return groups.sort(
    (a, b) => a.clientName.localeCompare(b.clientName) || a.clientId.localeCompare(b.clientId)
  );
}

/** Every conversation in the order the groups show them, for keyboard stepping and defaults. */
export function flattenGroups(
  groups: readonly ClientConversationGroup[]
): readonly ConversationSummary[] {
  return groups.flatMap((group) => group.conversations);
}

export function findConversation(
  groups: readonly ClientConversationGroup[],
  id: string | undefined
): ConversationSummary | undefined {
  if (id === undefined) return undefined;
  return flattenGroups(groups).find((conversation) => conversation.id === id);
}

/**
 * Whether a conversation needs the owner: a drafted reply is waiting, or the client is waiting on
 * a reply. When the owner's own last reply time is known (from their WhatsApp) that decides it;
 * otherwise Core's untriaged messages do, leaving out strangers Core holds back.
 */
export function needsAttention(
  conversation: Pick<ConversationSummary, 'untriagedCount' | 'heldCount' | 'lastMessage'>,
  hasWaitingDraft: boolean,
  ownLastAt?: string | null
): boolean {
  if (hasWaitingDraft) return true;
  if (ownLastAt !== undefined) return replyState(conversation, ownLastAt).kind === 'needs_reply';
  if (conversation.untriagedCount > conversation.heldCount) return true;
  const sender = conversation.lastMessage?.sender;
  return conversation.untriagedCount > 0 && sender !== undefined && sender !== UNRECOGNIZED_SENDER;
}

/** Case-insensitive match on client, project, channel and the last message. */
export function filterConversations(
  conversations: readonly ConversationSummary[],
  query: string
): readonly ConversationSummary[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return conversations;
  return conversations.filter((conversation) =>
    [
      conversation.source.clientName,
      conversation.source.projectName,
      conversation.source.channel,
      conversation.lastMessage?.sender ?? '',
      conversation.lastMessage?.text ?? '',
    ].some((field) => field.toLowerCase().includes(needle))
  );
}
