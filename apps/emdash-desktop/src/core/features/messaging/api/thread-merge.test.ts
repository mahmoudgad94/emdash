import { describe, expect, it } from 'vitest';
import type { HistoryMessage, ThreadMessage } from './schemas';
import { historySeq, mergeThread, oldestCoreTime } from './thread-merge';

const core = (seq: number, at: string | null, text = `core ${seq}`): ThreadMessage => ({
  seq,
  at,
  sender: 'Stephen',
  senderRef: 'r',
  text,
  attachments: [],
  edited: false,
  heldReason: null,
});

const history = (id: string, at: string, fromMe: boolean): HistoryMessage => ({
  id,
  at,
  fromMe,
  sender: fromMe ? 'You' : 'Stephen',
  text: `history ${id}`,
  attachments: [],
});

describe('mergeThread', () => {
  it("puts older history first and the owner's replies in time between Core messages", () => {
    const merged = mergeThread(
      [core(10, '2026-10-22T10:00:00.000Z'), core(11, '2026-10-22T12:00:00.000Z')],
      [history('a', '2026-10-20T10:00:00.000Z', false)],
      [history('b', '2026-10-22T11:00:00.000Z', true)]
    );
    expect(merged.map((m) => m.text)).toEqual(['history a', 'core 10', 'history b', 'core 11']);
    expect(merged[2]).toMatchObject({ outgoing: true, sender: 'You' });
    expect(merged[0]!.outgoing).toBe(false);
  });

  it('does not repeat a history message that appears twice', () => {
    const same = history('a', '2026-10-20T10:00:00.000Z', true);
    expect(mergeThread([], [same], [same])).toHaveLength(1);
  });

  it('keeps undated messages last and the original order for equal times', () => {
    const merged = mergeThread(
      [core(2, null), core(1, '2026-10-22T10:00:00.000Z'), core(3, '2026-10-22T10:00:00.000Z')],
      [],
      []
    );
    expect(merged.map((m) => m.seq)).toEqual([1, 3, 2]);
  });
});

describe('history ids and the cut-off', () => {
  it("gives history messages negative numbers that cannot meet Core's", () => {
    expect(historySeq('3EB014329D55956DC12153')).toBeLessThan(0);
    expect(historySeq('x')).not.toBe(historySeq('y'));
  });

  it('finds the oldest time Core captured', () => {
    expect(
      oldestCoreTime([
        core(1, '2026-10-22T12:00:00.000Z'),
        core(2, '2026-10-21T08:00:00.000Z'),
        core(3, null),
      ])
    ).toBe('2026-10-21T08:00:00.000Z');
    expect(oldestCoreTime([])).toBeUndefined();
  });
});
