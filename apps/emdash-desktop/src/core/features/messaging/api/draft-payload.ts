import type { ConversationSummary, CreateDraftInput } from './schemas';

/** Core assigns the revision, the inbound watermark and the policy version; these are placeholders. */
export const CORE_ASSIGNS_POLICY = 'core-assigns';

/**
 * Providers a reply can be drafted for. Core accepts Slack and Gmail drafts too, but how a
 * recipient maps to a Slack thread or a Gmail address is not settled, so only WhatsApp (where the
 * channel id is the recipient) is offered.
 */
export const DRAFTABLE_PROVIDERS: readonly string[] = ['whatsapp'];

/** The `actions.create_send` input for one reply. Core overwrites everything but the addressing and text. */
export type SendDraftPayload = {
  provider: string;
  account: string;
  channel: string;
  recipients: string[];
  text: string;
  attachments: never[];
  draftRevision: 0;
  inboundWatermark: 0;
  policyVersion: typeof CORE_ASSIGNS_POLICY;
};

export function buildDraftPayload(input: CreateDraftInput): SendDraftPayload {
  return {
    provider: input.provider,
    account: input.account,
    channel: input.channel,
    recipients: [input.channel],
    text: input.text,
    attachments: [],
    draftRevision: 0,
    inboundWatermark: 0,
    policyVersion: CORE_ASSIGNS_POLICY,
  };
}

/** The reply text as it is saved: surrounding blank space is dropped, the inside is kept as typed. */
export function normalizeReplyText(text: string): string {
  return text.trim();
}

/**
 * Why a reply cannot be saved for this conversation right now, regardless of what was typed;
 * null when the composer may be used.
 */
export function replyBlockedReason(
  conversation: Pick<ConversationSummary, 'provider' | 'source' | 'connector'>,
  online: boolean
): string | null {
  if (!online) return 'You are offline. Replies can be saved once the connection is back.';
  if (!DRAFTABLE_PROVIDERS.includes(conversation.provider)) {
    return 'Replies can only be drafted for WhatsApp conversations for now.';
  }
  if (conversation.source.account === null) {
    return 'Core did not say which account this conversation belongs to, so a reply cannot be addressed.';
  }
  if (conversation.connector.state !== 'healthy') {
    return 'The connector for this channel is not healthy. Wait for it to reconnect before replying.';
  }
  return null;
}

/** The input for `createDraft`, or undefined when the reply cannot be saved (blocked or empty). */
export function draftInputFor(
  conversation: Pick<ConversationSummary, 'provider' | 'source' | 'connector'>,
  text: string,
  online: boolean
): CreateDraftInput | undefined {
  const reply = normalizeReplyText(text);
  const { account } = conversation.source;
  if (reply === '' || account === null || replyBlockedReason(conversation, online) !== null) {
    return undefined;
  }
  return {
    provider: conversation.provider,
    account,
    channel: conversation.source.channel,
    text: reply,
  };
}
