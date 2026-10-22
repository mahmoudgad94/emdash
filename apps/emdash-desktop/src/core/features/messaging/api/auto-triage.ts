import { needsAttention } from './conversation-groups';
import type { ConversationSummary, Draft } from './schemas';
import { draftsForChannel } from './thread';

/** Most triage tasks the app starts by itself in one day. */
export const AUTO_TRIAGE_DAILY_CAP = 5;
const MAX_REMEMBERED = 200;

export type AutoTriageState = {
  version: '1';
  enabled: boolean;
  /**
   * The newest message that existed when automation first ran. Only messages that arrive after it
   * are triaged, so turning it on does not start a task for every old conversation at once.
   */
  baselineSeq: number | null;
  /** The local day the counter below belongs to, `YYYY-MM-DD`. */
  day: string;
  started: number;
  /** The last message each conversation was triaged at, so one message is triaged once. */
  attempted: Record<string, number>;
  autoDraft: boolean;
  /** Triage tasks whose answer has not been read back yet, by conversation. */
  pending: Record<string, { startedAt: string; clientId: string; projectId: string }>;
};

export const INITIAL_AUTO_TRIAGE_STATE: AutoTriageState = {
  version: '1',
  enabled: true,
  baselineSeq: null,
  day: '',
  started: 0,
  attempted: {},
  autoDraft: true,
  pending: {},
};

/** Starts a new day's count when the day has changed. */
export function rollDay(state: AutoTriageState, today: string): AutoTriageState {
  // A row saved before a field existed reads back without it; fill the gaps first.
  const complete: AutoTriageState = {
    ...state,
    attempted: state.attempted ?? {},
    pending: state.pending ?? {},
    autoDraft: state.autoDraft ?? true,
  };
  return complete.day === today ? complete : { ...complete, day: today, started: 0 };
}

/** Fixes the baseline at the newest message seen the first time automation runs. */
export function withBaseline(
  state: AutoTriageState,
  conversations: readonly Pick<ConversationSummary, 'lastSeq'>[]
): AutoTriageState {
  if (state.baselineSeq !== null) return state;
  return { ...state, baselineSeq: Math.max(0, ...conversations.map((c) => c.lastSeq)) };
}

export function canStartAutoTriage(state: AutoTriageState): boolean {
  return state.enabled && state.started < AUTO_TRIAGE_DAILY_CAP;
}

export type AutoTriageCandidate = { conversation: ConversationSummary; projectId: string };

/**
 * Conversations that arrived after the baseline, need the owner, were not triaged at this message
 * yet and belong to a client with an open project. Oldest first, so the longest waiting goes first.
 */
export function eligibleForAutoTriage(input: {
  state: AutoTriageState;
  conversations: readonly ConversationSummary[];
  drafts: readonly Draft[];
  projectFor: (conversation: ConversationSummary) => string | undefined;
}): AutoTriageCandidate[] {
  const baseline = input.state.baselineSeq;
  if (baseline === null) return [];
  const candidates: AutoTriageCandidate[] = [];
  for (const conversation of input.conversations) {
    if (conversation.lastSeq <= baseline) continue;
    if ((input.state.attempted[conversation.id] ?? 0) >= conversation.lastSeq) continue;
    const hasDraft =
      draftsForChannel(input.drafts, {
        provider: conversation.provider,
        account: conversation.source.account,
        channel: conversation.source.channel,
      }).length > 0;
    if (!needsAttention(conversation, hasDraft)) continue;
    const projectId = input.projectFor(conversation);
    if (projectId === undefined) continue;
    candidates.push({ conversation, projectId });
  }
  return candidates.sort(
    (a, b) =>
      a.conversation.lastSeq - b.conversation.lastSeq ||
      a.conversation.id.localeCompare(b.conversation.id)
  );
}

/** Records that a conversation was triaged at its newest message. */
export function recordAutoTriage(
  state: AutoTriageState,
  conversationId: string,
  lastSeq: number
): AutoTriageState {
  const attempted = { ...state.attempted, [conversationId]: lastSeq };
  const keys = Object.keys(attempted);
  if (keys.length > MAX_REMEMBERED) {
    for (const key of keys
      .sort((a, b) => (attempted[a] ?? 0) - (attempted[b] ?? 0))
      .slice(0, keys.length - MAX_REMEMBERED))
      delete attempted[key];
  }
  return { ...state, started: state.started + 1, attempted };
}

/** Whether Claude's answer should become a draft by itself: there is a reply and it is not a note. */
export function shouldAutoDraft(result: { type: string; draft: string }): boolean {
  return result.draft.trim() !== '' && result.type !== 'NOTE_TO_REMEMBER';
}
