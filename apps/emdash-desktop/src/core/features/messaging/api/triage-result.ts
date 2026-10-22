import {
  parseTriageResult,
  triageMarker,
  type TriageResult,
  type TriageType,
} from './triage-prompt';

/** The part of a session transcript entry the finder reads. */
export type TranscriptEntryLike = { role: 'user' | 'assistant' | 'tool'; text?: string };

/**
 * Looks for the triage of one conversation in a session transcript: the session whose prompt opens
 * with the conversation's marker, and the result block in what Claude answered after it. `found`
 * is true as soon as the prompt is seen, so the caller knows which session to keep reading.
 */
export function readTriage(
  conversationId: string,
  entries: readonly TranscriptEntryLike[]
): { found: boolean; result?: TriageResult } {
  const marker = triageMarker(conversationId);
  const start = entries.findIndex((entry) => entry.role === 'user' && entry.text?.includes(marker));
  if (start < 0) return { found: false };
  const answer = entries
    .slice(start + 1)
    .filter((entry) => entry.role === 'assistant' && entry.text)
    .map((entry) => entry.text)
    .join('\n');
  const result = parseTriageResult(answer);
  return result ? { found: true, result } : { found: true };
}

const TYPE_LABELS: Record<TriageType, string> = {
  NEW_TASK: 'New task',
  REPLY_ONLY: 'Just a reply',
  WAITING_ON_CLIENT: 'Waiting on the client',
  QUESTION_FOR_ME: 'A question for you',
  NOTE_TO_REMEMBER: 'Note to remember',
};

export function triageTypeLabel(type: TriageType): string {
  return TYPE_LABELS[type];
}

/** How long a triage is waited for before it is given up on. */
export const TRIAGE_GIVE_UP_MS = 45 * 60_000;
