import { UNRECOGNIZED_SENDER } from './labels';
import type { ConversationSummary } from './schemas';

/**
 * Whether a conversation is waiting on the owner, read without opening it: the client wrote last
 * and the owner has not answered since, the owner answered last, or there is nothing to answer.
 */
export type ReplyState =
  | { kind: 'needs_reply'; since: string | null }
  | { kind: 'replied'; at: string | null }
  | { kind: 'quiet' };

/**
 * `ownLastAt` is when the owner last wrote in the chat, from their own WhatsApp; undefined when
 * that is not known, null when they never did.
 */
export function replyState(
  conversation: Pick<ConversationSummary, 'lastMessage' | 'untriagedCount' | 'heldCount'>,
  ownLastAt: string | null | undefined
): ReplyState {
  const last = conversation.lastMessage;
  if (!last) return { kind: 'quiet' };
  if (last.senderRef === 'me') return { kind: 'replied', at: last.at };
  if (last.sender === UNRECOGNIZED_SENDER) return { kind: 'quiet' };
  if (ownLastAt && last.at && Date.parse(ownLastAt) >= Date.parse(last.at))
    return { kind: 'replied', at: ownLastAt };
  return { kind: 'needs_reply', since: last.at };
}
