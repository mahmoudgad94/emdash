import { channelLabel } from './labels';
import type { ConversationSummary, Draft } from './schemas';

export type DraftStateInfo = { label: string; tone: 'neutral' | 'info' | 'warning' };

/** What a draft's Core state means to the owner. */
export function describeDraftState(state: string): DraftStateInfo {
  switch (state) {
    case 'drafted':
      return { label: 'Draft', tone: 'neutral' };
    case 'awaiting_approval':
      return { label: 'Awaiting approval', tone: 'info' };
    case 'delivery_unknown':
      return { label: 'Delivery unknown', tone: 'warning' };
    default:
      return { label: state.replace(/_/g, ' '), tone: 'neutral' };
  }
}

export type DraftRow = {
  draft: Draft;
  clientName: string;
  channel: string;
};

const channelKey = (provider: string, account: string | null, channel: string) =>
  `${provider}|${account ?? ''}|${channel}`;

/**
 * Each waiting draft with the client and channel it belongs to, found by matching its addressing
 * against the conversations already loaded. A draft whose channel is not loaded keeps its raw
 * channel id and no client name.
 */
export function buildDraftRows(
  drafts: readonly Draft[],
  conversations: readonly ConversationSummary[]
): DraftRow[] {
  const byChannel = new Map<string, ConversationSummary>();
  for (const conversation of conversations) {
    byChannel.set(
      channelKey(conversation.provider, conversation.source.account, conversation.source.channel),
      conversation
    );
  }
  return drafts.map((draft) => {
    const conversation = byChannel.get(channelKey(draft.provider, draft.account, draft.channel));
    return {
      draft,
      clientName: conversation?.source.clientName ?? 'Unknown client',
      channel: conversation ? channelLabel(conversation) : draft.channel,
    };
  });
}
