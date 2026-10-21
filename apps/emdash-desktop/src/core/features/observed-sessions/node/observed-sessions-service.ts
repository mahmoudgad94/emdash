import { err, ok, type Result } from '@emdash/shared';
import { z } from 'zod';
import type {
  CoreInvoker,
  CoreLinkError,
} from '@core/features/clientops-core/api/node/core-invoker';
import type {
  ObservedSession,
  ObservedSessionsList,
  SessionListInput,
  SessionTranscript,
  WorkSummary,
} from '../api/schemas';

/** `work.list` answers at most this many sessions per call. */
const LIST_LIMIT = 200;

const text = z.string().nullish();
const count = z.number().nullish();

const sessionItemSchema = z.object({
  id: z.string(),
  clientId: text,
  projectId: text,
  status: z.string().optional(),
  host: z.string(),
  source: z.string(),
  startedAt: z.string(),
  endedAt: text,
  branch: text,
  toolCalls: count,
  filesTouched: count,
  commits: z.array(z.object({ hash: z.string(), subject: z.string() })).optional(),
  own: z.boolean().optional(),
});

const listSchema = z.object({ items: z.array(sessionItemSchema) });

const summarySchema = z.object({
  total: z.number().optional(),
  own: z.number().optional(),
  activeNow: z.number().optional(),
  active: z
    .array(
      z.object({
        id: z.string(),
        clientId: text,
        clientName: text,
        own: z.boolean().optional(),
        host: z.string(),
        source: z.string(),
        branch: text,
        toolCalls: count,
        endedAt: z.string(),
      })
    )
    .optional(),
  clients: z
    .array(
      z.object({
        clientId: text,
        clientName: text,
        count: z.number(),
        active: z.number().optional(),
      })
    )
    .optional(),
});

const transcriptSchema = z.object({
  id: z.string(),
  source: z.string(),
  host: z.string(),
  truncated: z.boolean().optional(),
  entries: z.array(
    z.object({
      key: z.string(),
      role: z.enum(['user', 'assistant', 'tool']),
      text: z.string().optional(),
      tool: z.object({ name: z.string(), summary: z.string().optional() }).optional(),
      at: z.string().optional(),
    })
  ),
});

const unreadable = (tool: string): CoreLinkError => ({
  code: 'invalid_response',
  message: `Core sent an unexpected ${tool} response`,
});

function toSession(item: z.infer<typeof sessionItemSchema>): ObservedSession {
  return {
    id: item.id,
    clientId: item.clientId ?? null,
    projectId: item.projectId ?? null,
    status: item.status ?? 'observed',
    host: item.host,
    source: item.source,
    startedAt: item.startedAt,
    endedAt: item.endedAt ?? null,
    branch: item.branch ?? null,
    toolCalls: item.toolCalls ?? null,
    filesTouched: item.filesTouched ?? null,
    commits: item.commits ?? [],
    own: item.own === true,
  };
}

/** Observed sessions for a client, Unmatched (`clientId: null`) or the owner's own projects. */
export async function listSessions(
  core: CoreInvoker,
  input: SessionListInput
): Promise<Result<ObservedSessionsList, CoreLinkError>> {
  const response = await core.invoke('work.list', {
    clientId: input.clientId,
    limit: LIST_LIMIT,
    ...(input.own === undefined ? {} : { own: input.own }),
  });
  if (!response.success) return response;
  const parsed = listSchema.safeParse(response.data);
  if (!parsed.success) return err(unreadable('work.list'));
  return ok({ items: parsed.data.items.map(toSession) });
}

/** Counts per client and the sessions live right now, from `work.summary`. */
export async function readWorkSummary(
  core: CoreInvoker
): Promise<Result<WorkSummary, CoreLinkError>> {
  const response = await core.invoke('work.summary', {});
  if (!response.success) return response;
  const parsed = summarySchema.safeParse(response.data);
  if (!parsed.success) return err(unreadable('work.summary'));
  const { data } = parsed;
  const active = (data.active ?? []).map((session) => ({
    id: session.id,
    clientId: session.clientId ?? null,
    clientName: session.clientName ?? null,
    own: session.own === true,
    host: session.host,
    source: session.source,
    branch: session.branch ?? null,
    toolCalls: session.toolCalls ?? null,
    endedAt: session.endedAt,
  }));
  return ok({
    total: data.total ?? 0,
    own: data.own ?? 0,
    activeNow: data.activeNow ?? active.length,
    active,
    clients: (data.clients ?? []).map((entry) => ({
      clientId: entry.clientId ?? null,
      clientName: entry.clientName ?? null,
      count: entry.count,
      active: entry.active ?? 0,
    })),
  });
}

/** A conversation read live from the machine that ran it; Core stores nothing. */
export async function readTranscript(
  core: CoreInvoker,
  id: string
): Promise<Result<SessionTranscript, CoreLinkError>> {
  const response = await core.invoke('work.transcript', { id });
  if (!response.success) return response;
  const parsed = transcriptSchema.safeParse(response.data);
  if (!parsed.success) return err(unreadable('work.transcript'));
  return ok({
    id: parsed.data.id,
    source: parsed.data.source,
    host: parsed.data.host,
    truncated: parsed.data.truncated === true,
    entries: parsed.data.entries,
  });
}
