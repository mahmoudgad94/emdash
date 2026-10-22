import type { HistoryMessage, ThreadMessage } from './schemas';

/** A stable negative number for a history message, so it never collides with Core's sequence numbers. */
export function historySeq(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (Math.imul(hash, 31) + id.charCodeAt(i)) | 0;
  return -(Math.abs(hash) + 1);
}

export function historyToThreadMessage(message: HistoryMessage): ThreadMessage {
  return {
    seq: historySeq(message.id),
    at: message.at,
    sender: message.sender,
    senderRef: message.fromMe ? 'me' : message.sender,
    text: message.text,
    attachments: message.attachments,
    edited: false,
    heldReason: null,
    outgoing: message.fromMe,
  };
}

/**
 * One timeline for a client conversation: the messages Core captured, older messages from the
 * owner's WhatsApp history, and the owner's own replies that Core does not capture. Oldest first;
 * a history message that is already in the list is not added twice.
 */
export function mergeThread(
  core: readonly ThreadMessage[],
  older: readonly HistoryMessage[],
  outgoing: readonly HistoryMessage[]
): ThreadMessage[] {
  const seen = new Set<number>();
  const merged: ThreadMessage[] = [];
  for (const message of core) {
    seen.add(message.seq);
    merged.push(message);
  }
  for (const message of [...older, ...outgoing]) {
    const converted = historyToThreadMessage(message);
    if (seen.has(converted.seq)) continue;
    seen.add(converted.seq);
    merged.push(converted);
  }
  const time = (message: ThreadMessage) =>
    message.at === null ? Number.POSITIVE_INFINITY : Date.parse(message.at);
  return merged
    .map((message, index) => ({ message, index }))
    .sort((a, b) => time(a.message) - time(b.message) || a.index - b.index)
    .map(({ message }) => message);
}

/** The time of the oldest message Core captured, which history is read up to. */
export function oldestCoreTime(core: readonly ThreadMessage[]): string | undefined {
  let oldest: string | undefined;
  for (const message of core) {
    if (message.at === null) continue;
    if (oldest === undefined || Date.parse(message.at) < Date.parse(oldest)) oldest = message.at;
  }
  return oldest;
}
