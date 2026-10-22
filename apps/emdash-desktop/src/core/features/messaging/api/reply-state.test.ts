import { describe, expect, it } from 'vitest';
import { replyState } from './reply-state';

const conversation = (sender: string, at: string | null, senderRef = 'r') => ({
  lastMessage: { text: 'hi', at, sender, senderRef },
  untriagedCount: 1,
  heldCount: 0,
});

describe('replyState', () => {
  it('needs a reply when the client wrote last and the owner has not answered since', () => {
    expect(
      replyState(conversation('Stephen', '2026-10-22T10:00:00.000Z'), '2026-10-22T09:00:00.000Z')
    ).toEqual({
      kind: 'needs_reply',
      since: '2026-10-22T10:00:00.000Z',
    });
    expect(replyState(conversation('Stephen', '2026-10-22T10:00:00.000Z'), null).kind).toBe(
      'needs_reply'
    );
  });

  it('is replied when the owner wrote after the client, from their phone or as the last message', () => {
    expect(
      replyState(conversation('Stephen', '2026-10-22T10:00:00.000Z'), '2026-10-22T10:05:00.000Z')
    ).toEqual({
      kind: 'replied',
      at: '2026-10-22T10:05:00.000Z',
    });
    expect(replyState(conversation('You', '2026-10-22T10:00:00.000Z', 'me'), undefined).kind).toBe(
      'replied'
    );
  });

  it('is quiet with no messages or when only an unknown sender wrote', () => {
    expect(replyState({ lastMessage: null, untriagedCount: 0, heldCount: 0 }, null).kind).toBe(
      'quiet'
    );
    expect(
      replyState(conversation('Unrecognized sender', '2026-10-22T10:00:00.000Z'), null).kind
    ).toBe('quiet');
  });
});
