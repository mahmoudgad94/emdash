import { z } from 'zod';

export const sessionCommitSchema = z.object({ hash: z.string(), subject: z.string() });

/** One Claude Code / Codex session Core captured on a machine. Never carries its log path. */
export const observedSessionSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  projectId: z.string().nullable(),
  status: z.string(),
  /** Core host id: `local-mac` or `ssh-<name>`. */
  host: z.string(),
  /** `claude`, `codex` or `git`. */
  source: z.string(),
  startedAt: z.string(),
  /** Last activity read from the session log; null while Core has not seen any. */
  endedAt: z.string().nullable(),
  branch: z.string().nullable(),
  toolCalls: z.number().nullable(),
  filesTouched: z.number().nullable(),
  commits: z.array(sessionCommitSchema),
  /** True for sessions in the owner's own projects rather than a client's. */
  own: z.boolean(),
});

export const observedSessionsListSchema = z.object({ items: z.array(observedSessionSchema) });

export const liveSessionSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  own: z.boolean(),
  host: z.string(),
  source: z.string(),
  branch: z.string().nullable(),
  toolCalls: z.number().nullable(),
  endedAt: z.string(),
});

export const clientSessionCountSchema = z.object({
  /** Null for sessions that match no client (Unmatched). */
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  count: z.number(),
  active: z.number(),
});

export const workSummarySchema = z.object({
  total: z.number(),
  /** Sessions in the owner's own projects. */
  own: z.number(),
  activeNow: z.number(),
  active: z.array(liveSessionSchema),
  clients: z.array(clientSessionCountSchema),
});

export const transcriptEntrySchema = z.object({
  key: z.string(),
  role: z.enum(['user', 'assistant', 'tool']),
  text: z.string().optional(),
  tool: z.object({ name: z.string(), summary: z.string().optional() }).optional(),
  at: z.string().optional(),
});

export const sessionTranscriptSchema = z.object({
  id: z.string(),
  source: z.string(),
  host: z.string(),
  /** True when only the most recent part of a long session was read. */
  truncated: z.boolean(),
  entries: z.array(transcriptEntrySchema),
});

export const observedSessionsErrorSchema = z.object({ code: z.string(), message: z.string() });

/** The input `work.list` takes: a client, or null for Unmatched (`own` selects the owner's). */
export const sessionListInputSchema = z.object({
  clientId: z.string().nullable(),
  own: z.boolean().optional(),
});

export const transcriptInputSchema = z.object({ id: z.string() });

export type SessionCommit = z.infer<typeof sessionCommitSchema>;
export type ObservedSession = z.infer<typeof observedSessionSchema>;
export type ObservedSessionsList = z.infer<typeof observedSessionsListSchema>;
export type LiveSession = z.infer<typeof liveSessionSchema>;
export type ClientSessionCount = z.infer<typeof clientSessionCountSchema>;
export type WorkSummary = z.infer<typeof workSummarySchema>;
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;
export type SessionTranscript = z.infer<typeof sessionTranscriptSchema>;
export type ObservedSessionsError = z.infer<typeof observedSessionsErrorSchema>;
export type SessionListInput = z.infer<typeof sessionListInputSchema>;
