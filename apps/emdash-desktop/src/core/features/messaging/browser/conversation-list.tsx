import { EmptyState } from '@emdash/ui/react/components';
import { ListView } from '@emdash/ui/react/patterns';
import { RelativeTime } from '@emdash/ui/react/primitives';
import type { KeyboardEvent } from 'react';
import type { ClientConversationGroup } from '../api/conversation-groups';
import { channelLabel, previewText } from '../api/labels';
import type { ReplyState } from '../api/reply-state';
import type { ConversationSummary } from '../api/schemas';
import { ConnectorDot } from './connector-dot';
import { ReplyChip } from './reply-chip';
import { TriageHint } from './triage-hint';

function onActivateKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.currentTarget.click();
}

function ConversationRow({
  conversation,
  selected,
  isLast,
  onSelect,
  replyStateOf,
}: {
  conversation: ConversationSummary;
  selected: boolean;
  isLast: boolean;
  onSelect: (id: string) => void;
  replyStateOf: (id: string) => ReplyState | undefined;
}) {
  const last = conversation.lastMessage;
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
      onClick={() => onSelect(conversation.id)}
      onKeyDown={onActivateKey}
    >
      <div className="flex min-h-14 flex-col justify-center gap-0.5 px-3 py-2">
        <div className="flex items-center gap-2">
          <ConnectorDot state={conversation.connector.state} />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {channelLabel(conversation)}
          </span>
          {last?.at && (
            <RelativeTime
              value={last.at}
              compact
              className="shrink-0 text-[11px] text-foreground-passive tabular-nums"
            />
          )}
        </div>
        <TriageHint conversationId={conversation.id} />
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-foreground-muted">
            {last ? `${last.sender}: ${previewText(last.text)}` : 'No messages yet'}
          </p>
          <ReplyChip state={replyStateOf(conversation.id)} />
        </div>
      </div>
    </ListView.Row>
  );
}

/** Left column of the Messages view: each client as a header, its conversations beneath. */
export function ConversationList({
  groups,
  selectedId,
  onSelect,
  searching,
  replyStates,
}: {
  groups: readonly ClientConversationGroup[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  searching: boolean;
  /** Whether each conversation waits on the owner, by id. */
  replyStates: ReadonlyMap<string, ReplyState>;
}) {
  if (groups.length === 0) {
    return (
      <EmptyState
        bare
        label={searching ? 'No conversations match your search.' : 'No conversations yet.'}
        description={
          searching ? undefined : 'Client messages show up here once Core has captured them.'
        }
      />
    );
  }
  return (
    <nav aria-label="Conversations" className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.clientId} className="flex flex-col gap-1.5">
          <ListView.SectionHeader label={group.clientName} count={group.conversations.length} />
          <div className="overflow-hidden rounded-lg border border-border bg-background-1">
            {group.conversations.map((conversation, index) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedId}
                isLast={index === group.conversations.length - 1}
                onSelect={onSelect}
                replyStateOf={(id) => replyStates.get(id)}
              />
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}
