import type { Draft, ThreadMessage } from './schemas';

export type DaySection = {
  /** `YYYY-MM-DD` in the local time zone, or `undated` for messages Core gave no time. */
  key: string;
  label: string;
  messages: readonly ThreadMessage[];
};

const UNDATED_KEY = 'undated';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parse(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const FULL_DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const FULL_DAY_WITH_YEAR = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** "Today", "Yesterday", or "Wed, Oct 21" (with the year when it is not this year). */
export function dayLabel(date: Date, now: Date): string {
  const today = dayKey(now);
  if (dayKey(date) === today) return 'Today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return (date.getFullYear() === now.getFullYear() ? FULL_DAY : FULL_DAY_WITH_YEAR).format(date);
}

/**
 * Messages (oldest first) split into one section per local calendar day. A message without a
 * usable time stays with the one before it, or opens an "Earlier" section when it comes first.
 */
export function groupMessagesByDay(messages: readonly ThreadMessage[], now: Date): DaySection[] {
  const sections: Array<{ key: string; label: string; messages: ThreadMessage[] }> = [];
  for (const message of messages) {
    const at = parse(message.at);
    const last = sections.at(-1);
    if (at === undefined) {
      if (last) last.messages.push(message);
      else sections.push({ key: UNDATED_KEY, label: 'Earlier', messages: [message] });
      continue;
    }
    const key = dayKey(at);
    if (last && last.key === key) last.messages.push(message);
    else sections.push({ key, label: dayLabel(at, now), messages: [message] });
  }
  return sections;
}

/** Drafts waiting on the conversation's channel: same provider, account and channel. */
export function draftsForChannel(
  drafts: readonly Draft[],
  channel: { provider: string; account: string | null; channel: string }
): readonly Draft[] {
  if (channel.account === null) return [];
  return drafts.filter(
    (draft) =>
      draft.provider === channel.provider &&
      draft.account === channel.account &&
      draft.channel === channel.channel
  );
}

/** A short "time of day" for a message bubble; empty when Core gave no usable time. */
export function messageTime(at: string | null): string {
  const date = parse(at);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
}
