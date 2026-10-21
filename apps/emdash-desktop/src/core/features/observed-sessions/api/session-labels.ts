import type { ObservedSession } from './schemas';

/** A session whose log moved in the last five minutes counts as live; this mirrors Core's rule. */
export const LIVE_WINDOW_MS = 5 * 60_000;

const LOCAL_MAC_HOST = 'local-mac';
const SSH_HOST_PREFIX = 'ssh-';

/** "Mac" for this machine and "Dev server" for the SSH host; anything else keeps its own id. */
export function hostLabel(host: string): string {
  if (host === LOCAL_MAC_HOST) return 'Mac';
  if (host.startsWith(SSH_HOST_PREFIX)) return 'Dev server';
  return host;
}

const SOURCE_LABELS: Record<string, string> = { claude: 'Claude', codex: 'Codex', git: 'Git' };

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? (source ? source[0]!.toUpperCase() + source.slice(1) : 'Unknown');
}

type Timed = { readonly startedAt?: string; readonly endedAt: string | null };

function parseMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

/** When the session last did anything, in ms since the epoch; 0 when it has no usable time. */
export function lastActivityMs(session: Timed): number {
  return parseMs(session.endedAt) ?? parseMs(session.startedAt) ?? 0;
}

/** The ISO time to display as "last activity", falling back to the start. */
export function lastActivityAt(session: Pick<ObservedSession, 'startedAt' | 'endedAt'>): string {
  return session.endedAt ?? session.startedAt;
}

export function isLiveSession(session: Timed, now: number): boolean {
  const last = lastActivityMs(session);
  return last > 0 && now - last < LIVE_WINDOW_MS;
}

/** Most recently active first; ties fall back to the id so the order is stable. */
export function compareByLastActivity(
  a: Pick<ObservedSession, 'id' | 'startedAt' | 'endedAt'>,
  b: Pick<ObservedSession, 'id' | 'startedAt' | 'endedAt'>
): number {
  return lastActivityMs(b) - lastActivityMs(a) || a.id.localeCompare(b.id);
}

export function compareByStart(
  a: Pick<ObservedSession, 'id' | 'startedAt' | 'endedAt'>,
  b: Pick<ObservedSession, 'id' | 'startedAt' | 'endedAt'>
): number {
  return (parseMs(b.startedAt) ?? 0) - (parseMs(a.startedAt) ?? 0) || compareByLastActivity(a, b);
}

export function compareByToolCalls(
  a: Pick<ObservedSession, 'id' | 'startedAt' | 'endedAt' | 'toolCalls'>,
  b: Pick<ObservedSession, 'id' | 'startedAt' | 'endedAt' | 'toolCalls'>
): number {
  return (b.toolCalls ?? -1) - (a.toolCalls ?? -1) || compareByLastActivity(a, b);
}
