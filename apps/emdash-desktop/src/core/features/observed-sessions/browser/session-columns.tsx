import { type CollectionViewColumn } from '@emdash/ui/react/patterns';
import { RelativeTime } from '@emdash/ui/react/primitives';
import type { ObservedSession } from '../api/schemas';
import type { SessionInfo } from '../api/session-info';
import { hostLabel, isLiveSession, sourceLabel } from '../api/session-labels';
import { useNow } from './use-now';

const LIVE_TICK_MS = 30_000;
const MUTED = 'text-foreground-passive';

/** A green dot while the session's log has moved in the last five minutes. */
export function LiveDot({ endedAt }: { endedAt: string | null }) {
  const now = useNow(LIVE_TICK_MS);
  const live = isLiveSession({ endedAt }, now);
  return (
    <span
      role={live ? 'img' : undefined}
      aria-label={live ? 'Active in the last five minutes' : undefined}
      className={live ? 'size-2 rounded-full bg-foreground-success' : 'size-2'}
    />
  );
}

function SourceCell({ source, host }: { source: string; host: string }) {
  return (
    <span className="truncate text-sm text-foreground">
      {sourceLabel(source)}
      <span className={MUTED}> · {hostLabel(host)}</span>
    </span>
  );
}

function BranchCell({ branch }: { branch: string | null }) {
  return branch ? (
    <span className="truncate font-mono text-xs text-foreground-muted" title={branch}>
      {branch}
    </span>
  ) : (
    <span className={`text-xs ${MUTED}`}>No branch</span>
  );
}

function ToolCallsCell({ count }: { count: number | null }) {
  return (
    <span className={`text-xs tabular-nums ${MUTED}`}>
      {count === null ? '—' : `${count} tool ${count === 1 ? 'call' : 'calls'}`}
    </span>
  );
}

function StartedCell({ startedAt }: { startedAt: string | null }) {
  return (
    <span className={`truncate text-xs tabular-nums ${MUTED}`}>
      Started {startedAt ? <RelativeTime value={startedAt} compact ago /> : '—'}
    </span>
  );
}

function ActivityCell({ at }: { at: string | null }) {
  return (
    <span className={`truncate text-xs text-foreground-muted tabular-nums`}>
      Active {at ? <RelativeTime value={at} compact ago /> : '—'}
    </span>
  );
}

/** Columns of the sessions list for one client: source and machine, branch, times, tool calls. */
export const SESSION_COLUMNS: readonly CollectionViewColumn<ObservedSession>[] = [
  { id: 'live', width: '0.5rem', cell: (session) => <LiveDot endedAt={session.endedAt} /> },
  {
    id: 'source',
    width: 'minmax(9rem, 12rem)',
    cell: (session) => <SourceCell source={session.source} host={session.host} />,
  },
  {
    id: 'branch',
    width: 'minmax(0, 1fr)',
    cell: (session) => <BranchCell branch={session.branch} />,
  },
  {
    id: 'started',
    width: '9rem',
    cell: (session) => <StartedCell startedAt={session.startedAt} />,
  },
  {
    id: 'activity',
    width: '8rem',
    cell: (session) => <ActivityCell at={session.endedAt ?? session.startedAt} />,
  },
  {
    id: 'tools',
    width: '7rem',
    align: 'end',
    cell: (session) => <ToolCallsCell count={session.toolCalls} />,
  },
];

/** Columns of the Live now group, which spans every client and so names the client. */
export const LIVE_COLUMNS: readonly CollectionViewColumn<SessionInfo>[] = [
  { id: 'live', width: '0.5rem', cell: (session) => <LiveDot endedAt={session.endedAt} /> },
  {
    id: 'client',
    width: 'minmax(6rem, 11rem)',
    cell: (session) => (
      <span className="truncate text-sm text-foreground" title={session.clientLabel}>
        {session.clientLabel}
      </span>
    ),
  },
  {
    id: 'source',
    width: 'minmax(9rem, 12rem)',
    cell: (session) => <SourceCell source={session.source} host={session.host} />,
  },
  {
    id: 'branch',
    width: 'minmax(0, 1fr)',
    cell: (session) => <BranchCell branch={session.branch} />,
  },
  { id: 'activity', width: '8rem', cell: (session) => <ActivityCell at={session.endedAt} /> },
  {
    id: 'tools',
    width: '7rem',
    align: 'end',
    cell: (session) => <ToolCallsCell count={session.toolCalls} />,
  },
];
