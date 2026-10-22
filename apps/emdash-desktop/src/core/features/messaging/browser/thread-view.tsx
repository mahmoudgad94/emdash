import { EmptyState, Markdown, Pill } from '@emdash/ui/react/components';
import { Button, Spinner } from '@emdash/ui/react/primitives';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMarkdownLinkOpener } from '@core/primitives/external-links/browser';
import {
  conversationMessagesQueryOptions,
  fetchHistory,
  MessagingQueryError,
  ownRepliesQueryOptions,
} from '../api/browser/messaging-queries';
import { describeMessagingFailure } from '../api/failure-messages';
import { UNRECOGNIZED_SENDER } from '../api/labels';
import { describeDraftState } from '../api/need-you';
import type { Draft, HistoryMessage, ThreadMessage } from '../api/schemas';
import { groupMessagesByDay, messageTime } from '../api/thread';
import { mergeThread, oldestCoreTime } from '../api/thread-merge';

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
      {/* A registered contact is a real client: Core holding the message back is its own business,
          not something to flag on every message. Strangers and suspicious messages keep the note. */}
      {message.heldReason &&
        (message.heldReason === 'injection_flagged' || message.sender === UNRECOGNIZED_SENDER) && (
          <Pill variant="warning">{HELD_NOTES[message.heldReason]}</Pill>
        )}
    </div>
  );
}

function OutgoingMessage({ message }: { message: ThreadMessage }) {
  const openLink = useMarkdownLinkOpener();
  return (
    <div className="flex max-w-[80%] flex-col items-end gap-1 self-end">
      <div className="rounded-lg border border-border bg-background-2 px-3 py-2">
        <div className="mb-1 flex items-baseline justify-end gap-2">
          <span className="text-[11px] text-foreground-passive tabular-nums">
            {messageTime(message.at)}
          </span>
          <span className="text-xs font-medium text-foreground">You</span>
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
    </div>
  );
}

const HISTORY_PAGE = 100;

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
 * One conversation as a thread: day sections, the client's messages on the left and the owner's
 * own replies and drafts on the right. Core's messages are read live every 15 seconds; the owner's
 * replies and any earlier history come from their local WhatsApp store, read-only.
 */
export function ThreadView({
  conversationId,
  channel,
  drafts,
  coreless = false,
}: {
  conversationId: string;
  /** The WhatsApp chat, for reading history; undefined for other providers. */
  channel: string | undefined;
  /** A client chat Core has not captured: the thread comes from WhatsApp history alone. */
  coreless?: boolean;
  drafts: readonly Draft[];
}) {
  const query = useQuery({
    ...conversationMessagesQueryOptions(conversationId),
    enabled: !coreless,
  });
  const [showHeld, setShowHeld] = useState(false);
  const oldestCore = useMemo(() => oldestCoreTime(query.data?.messages ?? []), [query.data]);
  const ownReplies = useQuery({
    ...ownRepliesQueryOptions(channel ?? '', oldestCore),
    enabled: channel !== undefined && query.isSuccess && !coreless,
  });
  const [older, setOlder] = useState<HistoryMessage[]>([]);
  const [olderState, setOlderState] = useState<
    'idle' | 'loading' | 'more' | 'done' | 'unavailable'
  >('idle');
  const loadOlder = useCallback(async () => {
    if (channel === undefined || olderState === 'loading') return;
    setOlderState('loading');
    try {
      const page = await fetchHistory({
        channel,
        before: older[0]?.at ?? oldestCore,
        limit: HISTORY_PAGE,
      });
      if (!page.available) {
        setOlderState('unavailable');
        return;
      }
      setOlder((current) => [...page.messages, ...current]);
      setOlderState(page.hasMore ? 'more' : 'done');
    } catch {
      setOlderState('unavailable');
    }
  }, [channel, olderState, older, oldestCore]);
  // Messages Core holds back from senders it does not know are not the owner's to answer, so
  // they stay folded away unless asked for. A held message from a registered contact stays visible.
  const isStranger = (message: ThreadMessage) =>
    message.heldReason !== null && message.sender === UNRECOGNIZED_SENDER;
  const held = useMemo(
    () => (query.data?.messages ?? []).filter(isStranger),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data]
  );
  // A chat Core has not captured opens on its latest history right away, once.
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (!coreless || autoLoaded.current) return;
    autoLoaded.current = true;
    void loadOlder();
  }, [coreless, loadOlder]);

  const sections = useMemo(
    () =>
      coreless
        ? groupMessagesByDay(mergeThread([], older, []), new Date())
        : query.data
          ? groupMessagesByDay(
              mergeThread(
                showHeld
                  ? query.data.messages
                  : query.data.messages.filter((message) => !isStranger(message)),
                older,
                ownReplies.data?.messages ?? []
              ),
              new Date()
            )
          : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coreless, query.data, showHeld, older, ownReplies.data]
  );

  // The newest message is what the owner opens a chat for: start at the bottom, and stay put when
  // earlier messages are added above.
  const endRef = useRef<HTMLDivElement>(null);
  const latestKey = sections.at(-1)?.messages.at(-1)?.seq;
  useEffect(() => {
    if (latestKey === undefined) return;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [latestKey]);

  if (!coreless && query.isPending) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!coreless && query.isError) {
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
  if (
    sections.length === 0 &&
    drafts.length === 0 &&
    held.length === 0 &&
    (!coreless || olderState === 'done' || olderState === 'unavailable')
  ) {
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
      {channel !== undefined && olderState !== 'done' && (
        <button
          type="button"
          className="self-center rounded-md bg-background-1 px-3 py-1.5 text-xs text-foreground-muted hover:text-foreground disabled:opacity-60"
          disabled={olderState === 'loading' || olderState === 'unavailable'}
          onClick={() => void loadOlder()}
        >
          {olderState === 'loading'
            ? 'Loading earlier messages…'
            : olderState === 'unavailable'
              ? 'Your WhatsApp history is not readable on this Mac'
              : 'Show earlier messages from your WhatsApp'}
        </button>
      )}
      {query.data?.truncated && (
        <p className="rounded-md bg-background-1 px-3 py-1.5 text-xs text-foreground-muted">
          Showing the earliest part of a long conversation.
        </p>
      )}
      {sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-2">
          <DaySeparator label={section.label} />
          {section.messages.map((message) =>
            message.outgoing ? (
              <OutgoingMessage key={message.seq} message={message} />
            ) : (
              <IncomingMessage key={message.seq} message={message} />
            )
          )}
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
      <div ref={endRef} />
    </div>
  );
}
