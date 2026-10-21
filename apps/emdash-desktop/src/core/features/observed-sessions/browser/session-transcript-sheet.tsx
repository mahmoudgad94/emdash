import { EmptyState, Pill } from '@emdash/ui/react/components';
import { Button, Sheet, Spinner } from '@emdash/ui/react/primitives';
import { useQuery } from '@tanstack/react-query';
import {
  ObservedSessionsQueryError,
  sessionTranscriptQueryOptions,
} from '../api/browser/observed-sessions-queries';
import { describeTranscriptFailure } from '../api/failure-messages';
import type { SessionInfo } from '../api/session-info';
import { hostLabel, sourceLabel } from '../api/session-labels';
import { TranscriptEntries } from './transcript-entries';

export const READ_ONLY_NOTE = 'Ran outside Client Ops · read only';
export const TRUNCATED_NOTE = 'Showing the most recent part';

function toolCallsLabel(count: number): string {
  return `${count} tool ${count === 1 ? 'call' : 'calls'}`;
}

function Facts({ info }: { info: SessionInfo }) {
  const facts = [
    sourceLabel(info.source),
    hostLabel(info.host),
    ...(info.branch ? [info.branch] : []),
    ...(info.toolCalls === null ? [] : [toolCallsLabel(info.toolCalls)]),
  ];
  return (
    <p className="truncate text-xs text-foreground-muted">
      <span className="text-foreground">{info.clientLabel}</span>
      {facts.map((fact) => (
        <span key={fact}> · {fact}</span>
      ))}
    </p>
  );
}

function TranscriptBody({ id, fallback }: { id: string; fallback: SessionInfo | undefined }) {
  const query = useQuery(sessionTranscriptQueryOptions(id));

  if (query.isPending) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (query.isError) {
    const code = query.error instanceof ObservedSessionsQueryError ? query.error.code : 'unknown';
    const failure = describeTranscriptFailure(code);
    return (
      <EmptyState
        bare
        label={failure.title}
        description={failure.detail}
        action={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  const transcript = query.data;
  return (
    <div className="flex flex-col gap-3">
      {transcript.truncated && (
        <p className="rounded-md bg-background-1 px-3 py-1.5 text-xs text-foreground-muted">
          {TRUNCATED_NOTE}
        </p>
      )}
      {transcript.entries.length === 0 ? (
        <EmptyState bare label="Nothing to show yet." description="The log has no messages." />
      ) : (
        <TranscriptEntries
          entries={transcript.entries}
          source={fallback?.source ?? transcript.source}
        />
      )}
    </div>
  );
}

/**
 * Read-only panel with the conversation of one captured session. The transcript is fetched when
 * the panel opens, straight from the machine that ran the session; nothing is saved here or in Core.
 */
export function SessionTranscriptSheet({
  sessionId,
  info,
  onClose,
}: {
  sessionId: string | undefined;
  info: SessionInfo | undefined;
  onClose: () => void;
}) {
  return (
    <Sheet.Root open={sessionId !== undefined} onOpenChange={(open) => !open && onClose()}>
      <Sheet.Content className="[-webkit-app-region:no-drag]" style={{ maxWidth: '44rem' }}>
        <Sheet.Header>
          <div className="flex min-w-0 flex-col gap-1">
            <Sheet.Title>{info ? `${sourceLabel(info.source)} session` : 'Session'}</Sheet.Title>
            {info && <Facts info={info} />}
            <div>
              <Pill variant="neutral">{READ_ONLY_NOTE}</Pill>
            </div>
          </div>
        </Sheet.Header>
        <Sheet.Body>
          {sessionId !== undefined && <TranscriptBody id={sessionId} fallback={info} />}
        </Sheet.Body>
      </Sheet.Content>
    </Sheet.Root>
  );
}
