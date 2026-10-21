import type { WorkSummary } from './schemas';
import { OWN_SCOPE, UNMATCHED_SCOPE, type SessionScope } from './session-scope';

export type RailEntry = {
  readonly scope: SessionScope;
  readonly label: string;
  /** Sessions captured for this entry. */
  readonly count: number;
  /** Sessions active in the last five minutes. */
  readonly active: number;
};

export type ClientRail = {
  readonly clients: readonly RailEntry[];
  readonly own: RailEntry;
  readonly unmatched: RailEntry;
};

export const OWN_LABEL = 'Your projects';
export const UNMATCHED_LABEL = 'Unmatched';

/**
 * The left column of the Clients view: every client the Clients slice knows (in its order),
 * with the counts Core's `work.summary` reports. A client Core has sessions for but the list
 * does not know yet is appended by the name Core gave it, so no captured work is hidden.
 */
export function buildClientRail(
  clients: readonly { readonly id: string; readonly name: string }[],
  summary: WorkSummary | undefined
): ClientRail {
  const counts = new Map<string, { count: number; active: number; name: string | null }>();
  let unmatched = { count: 0, active: 0 };
  for (const entry of summary?.clients ?? []) {
    if (entry.clientId === null) unmatched = { count: entry.count, active: entry.active };
    else
      counts.set(entry.clientId, {
        count: entry.count,
        active: entry.active,
        name: entry.clientName,
      });
  }

  const entries: RailEntry[] = clients.map((client) => ({
    scope: { kind: 'client', clientId: client.id },
    label: client.name,
    count: counts.get(client.id)?.count ?? 0,
    active: counts.get(client.id)?.active ?? 0,
  }));
  const known = new Set(clients.map((client) => client.id));
  for (const [clientId, entry] of counts) {
    if (known.has(clientId)) continue;
    entries.push({
      scope: { kind: 'client', clientId },
      label: entry.name ?? clientId,
      count: entry.count,
      active: entry.active,
    });
  }

  return {
    clients: entries,
    own: {
      scope: OWN_SCOPE,
      label: OWN_LABEL,
      count: summary?.own ?? 0,
      active: summary?.active.filter((session) => session.own).length ?? 0,
    },
    unmatched: { scope: UNMATCHED_SCOPE, label: UNMATCHED_LABEL, ...unmatched },
  };
}

/** The scope shown before the owner picks one: the first client with sessions, else the first. */
export function defaultScope(rail: ClientRail): SessionScope {
  const withSessions = rail.clients.find((entry) => entry.count > 0);
  return (withSessions ?? rail.clients[0])?.scope ?? OWN_SCOPE;
}
