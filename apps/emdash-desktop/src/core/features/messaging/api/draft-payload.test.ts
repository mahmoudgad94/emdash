import { describe, expect, it } from 'vitest';
import {
  buildDraftPayload,
  CORE_ASSIGNS_POLICY,
  draftInputFor,
  normalizeReplyText,
  replyBlockedReason,
} from './draft-payload';
import { conversation } from './test-support';

describe('buildDraftPayload', () => {
  it('addresses the reply to the conversation channel and leaves the rest to Core', () => {
    expect(
      buildDraftPayload({
        provider: 'whatsapp',
        account: '351900000000@s.whatsapp.net',
        channel: '351912345678@s.whatsapp.net',
        text: 'On it.',
      })
    ).toEqual({
      provider: 'whatsapp',
      account: '351900000000@s.whatsapp.net',
      channel: '351912345678@s.whatsapp.net',
      recipients: ['351912345678@s.whatsapp.net'],
      text: 'On it.',
      attachments: [],
      draftRevision: 0,
      inboundWatermark: 0,
      policyVersion: 'core-assigns',
    });
    expect(CORE_ASSIGNS_POLICY).toBe('core-assigns');
  });
});

describe('normalizeReplyText', () => {
  it('drops surrounding blank space and keeps line breaks inside', () => {
    expect(normalizeReplyText('  Hi\n\nthere \n')).toBe('Hi\n\nthere');
  });
});

describe('replyBlockedReason', () => {
  it('allows a healthy WhatsApp conversation while online', () => {
    expect(replyBlockedReason(conversation(), true)).toBeNull();
  });

  it('blocks while offline', () => {
    expect(replyBlockedReason(conversation(), false)).toMatch(/offline/i);
  });

  it.each(['catching_up', 'degraded', 'down', 'cursor_lost', 'revoked', 'restricted', null])(
    'blocks when the connector state is %s',
    (state) => {
      const blocked = replyBlockedReason(
        conversation({ connector: { state, lastEventAt: null } }),
        true
      );
      expect(blocked).toMatch(/connector/i);
    }
  );

  it('blocks providers other than WhatsApp', () => {
    expect(replyBlockedReason(conversation({ provider: 'slack' }), true)).toMatch(/WhatsApp/);
  });

  it('blocks when Core did not report the account', () => {
    const source = { ...conversation().source, account: null };
    expect(replyBlockedReason(conversation({ source }), true)).toMatch(/account/);
  });
});

describe('draftInputFor', () => {
  it('builds the createDraft input from the conversation source and the trimmed text', () => {
    expect(draftInputFor(conversation(), '  Sending it today.  ', true)).toEqual({
      provider: 'whatsapp',
      account: '351900000000@s.whatsapp.net',
      channel: '351912345678@s.whatsapp.net',
      text: 'Sending it today.',
    });
  });

  it('returns nothing for empty text, an offline app or an unhealthy connector', () => {
    expect(draftInputFor(conversation(), '   \n', true)).toBeUndefined();
    expect(draftInputFor(conversation(), 'Hi', false)).toBeUndefined();
    expect(
      draftInputFor(conversation({ connector: { state: 'down', lastEventAt: null } }), 'Hi', true)
    ).toBeUndefined();
  });
});
