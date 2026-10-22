import { activeClients } from '@core/features/clients/api/active-clients';
import type { Client, UnlinkedClient } from '@core/features/clients/api/schemas';
import { needsAttention } from '@core/features/messaging/api/conversation-groups';
import { channelLabel } from '@core/features/messaging/api/labels';
import type { ConversationSummary, Draft } from '@core/features/messaging/api/schemas';
import type { LiveSession } from '@core/features/observed-sessions/api/schemas';

export type NeedsYouItem = {
  key: string;
  clientName: string;
  /** Who wrote, and where: "Stephen Ellis, WhatsApp". */
  from: string;
  preview: string;
  at: string | null;
  /** How many messages are waiting in the conversation. */
  waiting: number;
  conversationId: string;
};

export type LiveItem = {
  id: string;
  clientName: string;
  source: string;
  host: string;
  branch: string | null;
  endedAt: string;
};

export type ActiveClientCard = {
  id: string;
  name: string;
  agreement: string | null;
  live: number;
  waiting: number;
};

export type TodayModel = {
  needsYou: NeedsYouItem[];
  /** Drafted replies saved and waiting for the owner's approval. */
  drafts: number;
  /** Messages Core is holding back from senders it does not know. */
  heldStrangers: number;
  live: LiveItem[];
  clients: ActiveClientCard[];
  /** Active dashboard clients that are not set up in Core. */
  unlinked: number;
};

export type TodayInput = {
  conversations: readonly ConversationSummary[];
  drafts: readonly Draft[];
  sessions: readonly LiveSession[];
  clients: readonly Client[];
  unlinked: readonly UnlinkedClient[];
  /** When the owner last wrote in each conversation, from their own WhatsApp; absent when unknown. */
  ownReplies?: ReadonlyMap<string, string | null>;
};

const SOURCE_LABELS: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', git: 'Git' };

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function hostLabel(host: string): string {
  return host === 'local-mac' ? 'This Mac' : host.replace(/^ssh-/, '');
}

function providerOf(conversation: ConversationSummary): string {
  return channelLabel(conversation).split(' · ')[0] ?? conversation.provider;
}

/** What the owner opens the app for: what needs them, what is running, and who they work for. */
export function buildToday(input: TodayInput): TodayModel {
  const hasDraft = (conversation: ConversationSummary) =>
    input.drafts.some(
      (draft) =>
        draft.provider === conversation.provider &&
        draft.account === conversation.source.account &&
        draft.channel === conversation.source.channel
    );

  const attention = input.conversations.filter((conversation) =>
    needsAttention(
      conversation,
      hasDraft(conversation),
      input.ownReplies?.has(conversation.id) ? input.ownReplies.get(conversation.id) : undefined
    )
  );
  const needsYou = [...attention]
    .sort((a, b) => b.lastSeq - a.lastSeq || a.id.localeCompare(b.id))
    .map(
      (conversation): NeedsYouItem => ({
        key: conversation.id,
        clientName: conversation.source.clientName,
        from: `${conversation.lastMessage?.sender ?? 'Someone'}, ${providerOf(conversation)}`,
        preview: conversation.lastMessage?.text ?? '',
        at: conversation.lastMessage?.at ?? null,
        waiting: Math.max(conversation.untriagedCount, 1),
        conversationId: conversation.id,
      })
    );

  const attentionIds = new Set(attention.map((conversation) => conversation.id));
  const heldStrangers = input.conversations
    .filter((conversation) => !attentionIds.has(conversation.id))
    .reduce((sum, conversation) => sum + conversation.heldCount, 0);

  const live = [...input.sessions]
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt) || a.id.localeCompare(b.id))
    .map(
      (session): LiveItem => ({
        id: session.id,
        clientName: session.own ? 'Your projects' : (session.clientName ?? 'Unmatched'),
        source: session.source,
        host: session.host,
        branch: session.branch,
        endedAt: session.endedAt,
      })
    );

  const liveByClient = new Map<string, number>();
  for (const session of input.sessions) {
    if (session.clientId !== null)
      liveByClient.set(session.clientId, (liveByClient.get(session.clientId) ?? 0) + 1);
  }
  const waitingByClient = new Map<string, number>();
  for (const conversation of attention) {
    const id = conversation.source.clientId;
    waitingByClient.set(
      id,
      (waitingByClient.get(id) ?? 0) + Math.max(conversation.untriagedCount, 1)
    );
  }
  const clients = activeClients(input.clients)
    .map(
      (client): ActiveClientCard => ({
        id: client.id,
        name: client.name,
        agreement: client.agreement,
        live: liveByClient.get(client.id) ?? 0,
        waiting: waitingByClient.get(client.id) ?? 0,
      })
    )
    .sort(
      (a, b) =>
        b.waiting - a.waiting ||
        b.live - a.live ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
    );

  return {
    needsYou,
    drafts: input.drafts.length,
    heldStrangers,
    live,
    clients,
    unlinked: input.unlinked.length,
  };
}

/** One line under the page title. */
export function summarizeToday(model: TodayModel): string {
  const needs = model.needsYou.length + (model.drafts > 0 ? 1 : 0);
  const parts = [
    needs === 0
      ? 'Nothing needs you.'
      : `${needs} ${needs === 1 ? 'thing needs' : 'things need'} you.`,
    model.live.length === 0
      ? 'No sessions are running.'
      : `${model.live.length} ${model.live.length === 1 ? 'session is' : 'sessions are'} running.`,
  ];
  return parts.join(' ');
}
