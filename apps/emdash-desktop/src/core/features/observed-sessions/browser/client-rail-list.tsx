import { Pill } from '@emdash/ui/react/components';
import { ListView } from '@emdash/ui/react/patterns';
import type { KeyboardEvent } from 'react';
import type { ClientRail, RailEntry } from '../api/client-rail';
import { sameScope, scopeKey, type SessionScope } from '../api/session-scope';

function onActivateKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.currentTarget.click();
}

function RailRow({
  entry,
  selected,
  isLast,
  onSelect,
}: {
  entry: RailEntry;
  selected: boolean;
  isLast: boolean;
  onSelect: (scope: SessionScope) => void;
}) {
  return (
    <ListView.Row
      bare
      interactive
      selected={selected}
      isLast={isLast}
      divider="subtle"
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(entry.scope)}
      onKeyDown={onActivateKey}
    >
      <div className="flex min-h-9 items-center gap-2 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{entry.label}</span>
        {entry.active > 0 && (
          <Pill variant="success" dot>
            {entry.active} live
          </Pill>
        )}
        <span className="w-6 shrink-0 text-right text-xs text-foreground-passive tabular-nums">
          {entry.count}
        </span>
      </div>
    </ListView.Row>
  );
}

function RailGroup({
  entries,
  selected,
  onSelect,
}: {
  entries: readonly RailEntry[];
  selected: SessionScope;
  onSelect: (scope: SessionScope) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background-1">
      {entries.map((entry, index) => (
        <RailRow
          key={scopeKey(entry.scope)}
          entry={entry}
          selected={sameScope(entry.scope, selected)}
          isLast={index === entries.length - 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/** Left column of the Clients view: each client, then the owner's own projects and Unmatched. */
export function ClientRailList({
  rail,
  selected,
  onSelect,
}: {
  rail: ClientRail;
  selected: SessionScope;
  onSelect: (scope: SessionScope) => void;
}) {
  return (
    <nav aria-label="Clients" className="flex flex-col gap-3">
      {rail.clients.length > 0 && (
        <RailGroup entries={rail.clients} selected={selected} onSelect={onSelect} />
      )}
      <RailGroup entries={[rail.own, rail.unmatched]} selected={selected} onSelect={onSelect} />
    </nav>
  );
}
