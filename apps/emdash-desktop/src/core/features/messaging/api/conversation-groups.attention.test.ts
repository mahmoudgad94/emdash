import { describe, expect, it } from 'vitest';
import { needsAttention } from './conversation-groups';

const from = (sender: string) => ({ text: 'hi', at: null, sender, senderRef: 'x' });

describe('needsAttention', () => {
  it('needs the owner for untriaged messages Core did not hold back', () => {
    expect(needsAttention({ untriagedCount: 3, heldCount: 1, lastMessage: null }, false)).toBe(
      true
    );
  });

  it('ignores conversations where everything untriaged is a stranger Core held back', () => {
    expect(
      needsAttention(
        { untriagedCount: 2, heldCount: 2, lastMessage: from('Unrecognized sender') },
        false
      )
    ).toBe(false);
    expect(needsAttention({ untriagedCount: 0, heldCount: 0, lastMessage: null }, false)).toBe(
      false
    );
  });

  it('still needs the owner when a registered contact is held back', () => {
    expect(
      needsAttention(
        { untriagedCount: 2, heldCount: 2, lastMessage: from('Ari Kimmelfeld') },
        false
      )
    ).toBe(true);
  });

  it('needs the owner when a drafted reply is waiting', () => {
    expect(needsAttention({ untriagedCount: 0, heldCount: 0, lastMessage: null }, true)).toBe(true);
  });
});

describe("needsAttention with the owner's own replies", () => {
  const waiting = { untriagedCount: 6, heldCount: 0, lastMessage: from('Stephen Ellis') };
  it('stops needing the owner once they answered from their phone', () => {
    const withTime = {
      ...waiting,
      lastMessage: { ...from('Stephen Ellis'), at: '2026-10-22T10:00:00.000Z' },
    };
    expect(needsAttention(withTime, false, '2026-10-22T10:05:00.000Z')).toBe(false);
    expect(needsAttention(withTime, false, '2026-10-22T09:00:00.000Z')).toBe(true);
  });
});
