import { describe, expect, it } from 'vitest';
import {
  AUTO_TRIAGE_DAILY_CAP,
  INITIAL_AUTO_TRIAGE_STATE,
  canStartAutoTriage,
  eligibleForAutoTriage,
  recordAutoTriage,
  shouldAutoDraft,
  rollDay,
  withBaseline,
  type AutoTriageState,
} from './auto-triage';
import type { ConversationSummary } from './schemas';

const conversation = (id: string, lastSeq: number, untriagedCount = 1): ConversationSummary => ({
  id,
  provider: 'whatsapp',
  lastSeq,
  lastMessage: { text: 'hi', at: null, sender: 'Ari', senderRef: 'x' },
  messageCount: 1,
  untriagedCount,
  heldCount: 0,
  source: {
    clientId: 'c1',
    clientName: 'Acme',
    projectId: 'p',
    projectName: 'Site',
    channelId: `ch-${id}`,
    channel: `chan-${id}`,
    account: 'acct',
    context: 'private',
  },
  connector: { state: 'healthy', lastEventAt: null },
});

const base = (over: Partial<AutoTriageState> = {}): AutoTriageState => ({
  ...INITIAL_AUTO_TRIAGE_STATE,
  baselineSeq: 10,
  day: '2026-10-22',
  ...over,
});

describe('baseline', () => {
  it('is fixed at the newest message the first time, so old conversations are left alone', () => {
    const state = withBaseline(INITIAL_AUTO_TRIAGE_STATE, [
      conversation('a', 7),
      conversation('b', 12),
    ]);
    expect(state.baselineSeq).toBe(12);
    expect(withBaseline(state, [conversation('c', 99)]).baselineSeq).toBe(12);
  });
});

describe('eligibleForAutoTriage', () => {
  const projectFor = () => 'proj';

  it('picks only conversations newer than the baseline, oldest first', () => {
    const found = eligibleForAutoTriage({
      state: base(),
      conversations: [conversation('old', 9), conversation('new2', 15), conversation('new1', 11)],
      drafts: [],
      projectFor,
    });
    expect(found.map((c) => c.conversation.id)).toEqual(['new1', 'new2']);
  });

  it('skips a message that was already triaged and ones that do not need the owner', () => {
    const found = eligibleForAutoTriage({
      state: base({ attempted: { done: 20 } }),
      conversations: [
        conversation('done', 20),
        conversation('quiet', 21, 0),
        conversation('fresh', 22),
      ],
      drafts: [],
      projectFor,
    });
    expect(found.map((c) => c.conversation.id)).toEqual(['fresh']);
  });

  it('triages again when a newer message arrives in a conversation', () => {
    const found = eligibleForAutoTriage({
      state: base({ attempted: { a: 20 } }),
      conversations: [conversation('a', 25)],
      drafts: [],
      projectFor,
    });
    expect(found).toHaveLength(1);
  });

  it('leaves out clients with no open project and does nothing before a baseline exists', () => {
    expect(
      eligibleForAutoTriage({
        state: base(),
        conversations: [conversation('a', 30)],
        drafts: [],
        projectFor: () => undefined,
      })
    ).toEqual([]);
    expect(
      eligibleForAutoTriage({
        state: base({ baselineSeq: null }),
        conversations: [conversation('a', 30)],
        drafts: [],
        projectFor,
      })
    ).toEqual([]);
  });
});

describe('the daily limit', () => {
  it('stops at the cap, resets on a new day and respects the switch', () => {
    let state = base();
    for (let i = 0; i < AUTO_TRIAGE_DAILY_CAP; i += 1)
      state = recordAutoTriage(state, `c${i}`, 20 + i);
    expect(canStartAutoTriage(state)).toBe(false);
    expect(canStartAutoTriage(rollDay(state, '2026-10-23'))).toBe(true);
    expect(canStartAutoTriage(rollDay({ ...state, enabled: false }, '2026-10-23'))).toBe(false);
  });

  it('remembers only the most recent conversations', () => {
    let state = base();
    for (let i = 0; i < 260; i += 1) state = recordAutoTriage(state, `c${i}`, 100 + i);
    expect(Object.keys(state.attempted)).toHaveLength(200);
    expect(state.attempted.c259).toBe(359);
    expect(state.attempted.c0).toBeUndefined();
  });
});

describe('shouldAutoDraft', () => {
  it('drafts a reply but not an empty one or a note to remember', () => {
    expect(shouldAutoDraft({ type: 'REPLY_ONLY', draft: 'Thanks, on it.' })).toBe(true);
    expect(shouldAutoDraft({ type: 'WAITING_ON_CLIENT', draft: '  ' })).toBe(false);
    expect(shouldAutoDraft({ type: 'NOTE_TO_REMEMBER', draft: 'x' })).toBe(false);
  });
});
