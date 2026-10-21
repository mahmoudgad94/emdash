import { describe, expect, it } from 'vitest';
import { conversation, draft, message } from './test-support';
import { dayLabel, draftsForChannel, groupMessagesByDay, messageTime } from './thread';

// Built from local-time parts so the expectations hold in any time zone.
const local = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();
const now = new Date(2026, 9, 21, 14, 0);

describe('dayLabel', () => {
  it('says Today and Yesterday, then a weekday and date', () => {
    expect(dayLabel(new Date(2026, 9, 21, 8), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 20, 23), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 9, 14, 12), now)).toBe('Wed, Oct 14');
  });

  it('adds the year for another year', () => {
    expect(dayLabel(new Date(2025, 11, 30, 12), now)).toBe('Tue, Dec 30, 2025');
  });
});

describe('groupMessagesByDay', () => {
  it('splits messages into one section per calendar day, oldest first', () => {
    const sections = groupMessagesByDay(
      [
        message({ seq: 1, at: local(19, 22) }),
        message({ seq: 2, at: local(20, 9) }),
        message({ seq: 3, at: local(20, 18) }),
        message({ seq: 4, at: local(21, 8) }),
      ],
      now
    );
    expect(sections.map((s) => [s.label, s.messages.map((m) => m.seq)])).toEqual([
      ['Mon, Oct 19', [1]],
      ['Yesterday', [2, 3]],
      ['Today', [4]],
    ]);
  });

  it('keeps a message without a time with the one before it', () => {
    const sections = groupMessagesByDay(
      [message({ seq: 1, at: local(21, 8) }), message({ seq: 2, at: null })],
      now
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]!.messages.map((m) => m.seq)).toEqual([1, 2]);
  });

  it('opens an Earlier section when the first message has no time', () => {
    const sections = groupMessagesByDay([message({ seq: 1, at: 'not a date' })], now);
    expect(sections.map((s) => s.label)).toEqual(['Earlier']);
  });

  it('is empty for an empty thread', () => {
    expect(groupMessagesByDay([], now)).toEqual([]);
  });
});

describe('draftsForChannel', () => {
  const { source, provider } = conversation();
  const channel = { provider, account: source.account, channel: source.channel };

  it('keeps only drafts for the same provider, account and channel', () => {
    const drafts = [
      draft({ id: 'same' }),
      draft({ id: 'other-channel', channel: 'someone-else@s.whatsapp.net' }),
      draft({ id: 'other-account', account: '351911111111@s.whatsapp.net' }),
      draft({ id: 'other-provider', provider: 'slack' }),
    ];
    expect(draftsForChannel(drafts, channel).map((d) => d.id)).toEqual(['same']);
  });

  it('matches nothing when the conversation account is unknown', () => {
    expect(draftsForChannel([draft()], { ...channel, account: null })).toEqual([]);
  });
});

describe('messageTime', () => {
  it('shows the local hour and minute, or nothing without a usable time', () => {
    expect(messageTime(local(21, 9, 5))).toBe('09:05');
    expect(messageTime(null)).toBe('');
    expect(messageTime('garbage')).toBe('');
  });
});
