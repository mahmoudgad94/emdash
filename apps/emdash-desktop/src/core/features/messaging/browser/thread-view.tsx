import { EmptyState, Markdown, Pill } from '@emdash/ui/react/components';
import { Button, Spinner } from '@emdash/ui/react/primitives';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useMarkdownLinkOpener } from '@core/primitives/external-links/browser';
import {
  conversationMessagesQueryOptions,
  MessagingQueryError,
} from '../api/browser/messaging-queries';
import { describeMessagingFailure } from '../api/failure-messages';
import { UNRECOGNIZED_SENDER } from '../api/labels';
import { describeDraftState } from '../api/need-you';
import type { Draft, ThreadMessage } from '../api/schemas';
import { groupMessagesByDay, messageTime } from '../api/thread';

const HELD_NOTES = {
  quarantined: 'Held by Core: sender not recognised',
  injection_flagged: 'Held by Core: flagged as suspicious',
} as const;

function IncomingMessage({ message }: { message: ThreadMessage }) {
  const openLink = useMarkdownLinkOpener();
  return (
    <div className="flex max-w-[80%] flex-col items-start gap-1 self-start">
      <div className="rounded-lg border border-border bg-background-1 px-3 py-2">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground">{message.sender}</span>
          <span className="text-[11px] text-foreground-passive tabular-nums">
            {messageTime(message.at)}
          </span>
          {message.edited && <span className="text-[11px] text-foreground-passive">edited</span>}
        </div>
        <div className="text-sm break-words text-foreground [&_*:last-child]:mb-0">
          <Markdown content={message.text} variant="compact" onOpenLink={openLink} />
        </div>
        {message.attachments.length > 0 && (
          <p className="mt-1 text-xs text-foreground-muted">
            Attached: {message.attachments.join(', ')}
          </p>
        )}
      </div>
      {message.heldReason && <Pill variant="warning">{HELD_NOTES[message.heldReason]}</Pill>}
    </div>
  );
}

function DraftBubble({ draft }: { draft: Draft }) {
  const state = describeDraftState(draft.state);
  return (
    <div className="flex max-w-[80%] flex-col items-end gap-1 self-end">
      <div className="rounded-lg border border-dashed border-border bg-background-2 px-3 py-2">
        <p className="text-sm break-words whitespace-pre-wrap text-foreground">{draft.text}</p>
      </div>
      <Pill variant={state.tone === 'warning' ? 'warning' : 'info'}>{state.label}</Pill>
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-medium tracking-wide text-foreground-passive uppercase">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * One conversation as a thread: day sections, the client's messages on the left and drafts
 * waiting for approval on the right. Messages are read live from Core every 15 seconds.
 */
export function ThreadView({
  conversationId,
  drafts,
}: {
  conversationId: string;
  drafts: readonly Draft[];
}) {
  const query = useQuery(conversationMessagesQueryOptions(conversationId));
  const [showHeld, setShowHeld] = useState(false);
  // Messages Core holds back from senders it does not know are not the owner's to answer, so
  // they stay folded away unless asked for. A held message from a registered contact stays visible.
  const isStranger = (message: ThreadMessage) =>
    message.heldReason !== null && message.sender === UNRECOGNIZED_SENDER;
  const held = useMemo(
    () => (query.data?.messages ?? []).filter(isStranger),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data]
  );
  const sections = useMemo(
    () =>
      query.data
        ? groupMessagesByDay(
            showHeld
              ? query.data.messages
              : query.data.messages.filter((message) => !isStranger(message)),
            new Date()
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data, showHeld]
  );

  if (query.isPending) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (query.isError) {
    const code = query.error instanceof MessagingQueryError ? query.error.code : 'unknown';
    const failure = describeMessagingFailure(code, 'thread');
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
  if (sections.length === 0 && drafts.length === 0 && held.length === 0) {
    return (
      <EmptyState
        bare
        label="Nothing to show yet."
        description="This conversation has no messages."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {query.data.truncated && (
        <p className="rounded-md bg-background-1 px-3 py-1.5 text-xs text-foreground-muted">
          Showing the earliest part of a long conversation.
        </p>
      )}
      {sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-2">
          <DaySeparator label={section.label} />
          {section.messages.map((message) => (
            <IncomingMessage key={message.seq} message={message} />
          ))}
        </section>
      ))}
      {held.length > 0 && (
        <button
          type="button"
          className="self-start rounded-md bg-background-1 px-3 py-1.5 text-xs text-foreground-muted hover:text-foreground"
          onClick={() => setShowHeld((value) => !value)}
        >
          {showHeld
            ? 'Hide messages held by Core'
            : `${held.length} ${held.length === 1 ? 'message' : 'messages'} from senders Core does not trust, held back · Show`}
        </button>
      )}
      {drafts.length > 0 && (
        <section className="flex flex-col gap-2">
          <DaySeparator label="Waiting for your approval" />
          {drafts.map((draft) => (
            <DraftBubble key={draft.id} draft={draft} />
          ))}
        </section>
      )}
    </div>
  );
}
