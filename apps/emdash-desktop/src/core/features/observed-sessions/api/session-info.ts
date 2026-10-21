import { OWN_LABEL, UNMATCHED_LABEL } from './client-rail';
import type { LiveSession, ObservedSession } from './schemas';

/** What the transcript header and the Live now rows show about a session. */
export type SessionInfo = {
  readonly id: string;
  readonly clientLabel: string;
  readonly source: string;
  readonly host: string;
  readonly branch: string | null;
  readonly toolCalls: number | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
};

type Placed = { readonly clientId: string | null; readonly own: boolean };

/** The client a session belongs to, "Your projects" for the owner's own, else "Unmatched". */
export function clientLabelOf(
  session: Placed & { readonly clientName?: string | null },
  clientNames: ReadonlyMap<string, string>
): string {
  if (session.clientId !== null) {
    return clientNames.get(session.clientId) ?? session.clientName ?? 'Client';
  }
  return session.own ? OWN_LABEL : UNMATCHED_LABEL;
}

export function sessionInfoOf(
  session: ObservedSession | LiveSession,
  clientNames: ReadonlyMap<string, string>
): SessionInfo {
  return {
    id: session.id,
    clientLabel: clientLabelOf(session, clientNames),
    source: session.source,
    host: session.host,
    branch: session.branch,
    toolCalls: session.toolCalls,
    startedAt: 'startedAt' in session ? session.startedAt : null,
    endedAt: session.endedAt,
  };
}

/** Finds an opened session among the listed ones, then among those live now. */
export function findSessionInfo(
  id: string,
  listed: readonly ObservedSession[],
  live: readonly LiveSession[],
  clientNames: ReadonlyMap<string, string>
): SessionInfo | undefined {
  const session = listed.find((item) => item.id === id) ?? live.find((item) => item.id === id);
  return session ? sessionInfoOf(session, clientNames) : undefined;
}
