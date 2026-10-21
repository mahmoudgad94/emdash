import { Markdown } from '@emdash/ui/react/components';
import { AbsoluteTime } from '@emdash/ui/react/primitives';
import { WrenchIcon } from 'lucide-react';
import { useMarkdownLinkOpener } from '@core/primitives/external-links/browser';
import type { TranscriptEntry } from '../api/schemas';
import { sourceLabel } from '../api/session-labels';

function EntryTime({ at }: { at: string | undefined }) {
  return at ? (
    <AbsoluteTime
      value={at}
      className="shrink-0 text-[11px] text-foreground-passive tabular-nums"
    />
  ) : null;
}

function ToolStep({ entry }: { entry: TranscriptEntry }) {
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-foreground-muted">
      <WrenchIcon className="size-3 shrink-0 text-foreground-passive" aria-hidden="true" />
      <span className="shrink-0 font-mono text-foreground">{entry.tool?.name}</span>
      {entry.tool?.summary && (
        <span className="min-w-0 flex-1 truncate" title={entry.tool.summary}>
          {entry.tool.summary}
        </span>
      )}
      <span className="ml-auto" />
      <EntryTime at={entry.at} />
    </div>
  );
}

function Message({
  entry,
  speaker,
  tone,
}: {
  entry: TranscriptEntry;
  speaker: string;
  tone: 'user' | 'assistant';
}) {
  const openLink = useMarkdownLinkOpener();
  return (
    <div
      className={
        tone === 'user' ? 'rounded-lg border border-border bg-background-1 px-3 py-2' : 'px-3 py-1'
      }
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] font-medium tracking-wide text-foreground-passive uppercase">
          {speaker}
        </span>
        <EntryTime at={entry.at} />
      </div>
      <div className="text-sm break-words text-foreground [&_*:last-child]:mb-0">
        <Markdown content={entry.text ?? ''} variant="compact" onOpenLink={openLink} />
      </div>
    </div>
  );
}

/** The conversation, oldest first: markdown for what was said, one compact row per tool step. */
export function TranscriptEntries({
  entries,
  source,
}: {
  entries: readonly TranscriptEntry[];
  source: string;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.key}>
          {entry.role === 'tool' ? (
            <ToolStep entry={entry} />
          ) : (
            <Message
              entry={entry}
              speaker={entry.role === 'user' ? 'You' : sourceLabel(source)}
              tone={entry.role}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
