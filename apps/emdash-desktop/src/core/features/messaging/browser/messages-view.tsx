import { EmptyState, Pill } from '@emdash/ui/react/components';
import { PageLayout } from '@emdash/ui/react/patterns';
import { Button, SearchInput, Spinner } from '@emdash/ui/react/primitives';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { clientsQueryOptions } from '@core/features/clients/api/browser/clients-queries';
import { settingsViewDef } from '@core/features/settings/contributions/views';
import { Titlebar } from '@core/features/workbench/contributions/browser/Titlebar';
import { SubjectProvider } from '@core/primitives/mementos/react';
import {
  useCurrentViewParams,
  useNavigate,
} from '@core/primitives/navigation/browser/navigation-hooks';
import { defineViewRuntime } from '@core/primitives/views/react';
import {
  connectorsQueryOptions,
  conversationsQueryOptions,
  fetchHistory,
  MessagingQueryError,
  needYouQueryOptions,
} from '../api/browser/messaging-queries';
import { useOwnLastReplies } from '../api/browser/own-replies';
import {
  clientWhatsAppChannels,
  isLocalConversation,
  localClientConversations,
} from '../api/client-chats';
import {
  filterConversations,
  findConversation,
  needsAttention,
  flattenGroups,
  groupConversationsByClient,
} from '../api/conversation-groups';
import { describeMessagingFailure } from '../api/failure-messages';
import { channelLabel, connectorBadge } from '../api/labels';
import { replyState } from '../api/reply-state';
import type { ConversationSummary, HistoryMessage } from '../api/schemas';
import { draftsForChannel } from '../api/thread';
import { clientThreadSubject } from '../contributions/subject';
import { messagesViewDef } from '../contributions/views';
import { AskClaudeButton } from './ask-claude-button';
import { ConnectorDot } from './connector-dot';
import { ConversationList } from './conversation-list';
import { NeedYouSheet } from './need-you-sheet';
import { ReplyComposer } from './reply-composer';
import { ThreadView } from './thread-view';
import { TriageSuggestion } from './triage-suggestion';

const EMPTY_CONVERSATIONS: readonly ConversationSummary[] = [];

function failureCode(error: unknown): string {
  return error instanceof MessagingQueryError ? error.code : 'unknown';
}

export function MessagesBreadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center px-2">
      <span className="max-w-[14rem] truncate rounded-sm px-1 py-0.5 text-sm text-foreground">
        Messages
      </span>
    </nav>
  );
}

function NotAvailable({ code }: { code: string }) {
  const { navigate } = useNavigate();
  const failure = describeMessagingFailure(code, 'conversations');
  return (
    <EmptyState
      label={failure.title}
      description={failure.detail}
      action={
        code === 'not_connected' ? (
          <Button
            variant="secondary"
            onClick={() => navigate(settingsViewDef({ tab: 'clientops-core' }))}
          >
            Open Client Ops Core settings
          </Button>
        ) : undefined
      }
    />
  );
}

export function MessagesView() {
  const { params, setParams } = useCurrentViewParams(messagesViewDef);
  const conversationsQuery = useQuery(conversationsQueryOptions());
  const needYouQuery = useQuery(needYouQueryOptions());
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(true);

  const clientsQuery = useQuery(clientsQueryOptions());
  const connectorsQuery = useQuery(connectorsQueryOptions());
  // Client chats Core has no messages for yet still belong in the list, read from WhatsApp history.
  const clientChannels = useMemo(
    () => clientWhatsAppChannels(clientsQuery.data?.clients ?? []),
    [clientsQuery.data]
  );
  const lastMessages = useQueries({
    queries: clientChannels.map(({ channel }) => ({
      queryKey: ['clientops', 'messaging', 'history', 'last', channel.channel] as const,
      queryFn: () => fetchHistory({ channel: channel.channel, limit: 1 }),
      staleTime: 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
    combine: (results) => results.map((result) => result.data?.messages.at(-1)),
  });
  const lastByChannel = useMemo(() => {
    const map = new Map<string, HistoryMessage>();
    clientChannels.forEach(({ channel }, index) => {
      const last = lastMessages[index];
      if (last) map.set(channel.channel, last);
    });
    return map;
  }, [clientChannels, lastMessages]);
  const captured = conversationsQuery.data?.conversations;
  const whatsappState =
    connectorsQuery.data?.connectors.find((c) => c.provider === 'whatsapp')?.state ?? null;
  const all = useMemo(
    () =>
      captured === undefined
        ? undefined
        : [
            ...captured,
            ...localClientConversations(
              clientsQuery.data?.clients ?? [],
              captured,
              lastByChannel,
              whatsappState
            ),
          ],
    [captured, clientsQuery.data, lastByChannel, whatsappState]
  );
  const waitingDrafts = needYouQuery.data?.drafts;
  const ownReplies = useOwnLastReplies(all ?? EMPTY_CONVERSATIONS);
  // What needs the owner: accepted messages nobody has triaged, or a draft waiting for approval.
  const attention = useMemo(
    () =>
      (all ?? []).filter((conversation) =>
        needsAttention(
          conversation,
          draftsForChannel(waitingDrafts ?? [], {
            provider: conversation.provider,
            account: conversation.source.account,
            channel: conversation.source.channel,
          }).length > 0,
          ownReplies.has(conversation.id) ? ownReplies.get(conversation.id) : undefined
        )
      ),
    [all, waitingDrafts, ownReplies]
  );
  const replyStates = useMemo(
    () =>
      new Map(
        (all ?? []).map((conversation) => [
          conversation.id,
          replyState(
            conversation,
            ownReplies.has(conversation.id) ? ownReplies.get(conversation.id) : undefined
          ),
        ])
      ),
    [all, ownReplies]
  );
  const visible = useMemo(() => (showAll ? (all ?? []) : attention), [showAll, all, attention]);
  const groups = useMemo(
    () => groupConversationsByClient(filterConversations(visible, search)),
    [visible, search]
  );
  const everyGroup = useMemo(() => groupConversationsByClient(all ?? []), [all]);
  const visibleGroups = useMemo(() => groupConversationsByClient(visible), [visible]);
  // Without a chosen conversation the most recent one that needs the owner is open.
  const selected =
    findConversation(everyGroup, params.conversationId) ?? flattenGroups(visibleGroups)[0];

  const drafts = useMemo(
    () =>
      selected
        ? draftsForChannel(needYouQuery.data?.drafts ?? [], {
            provider: selected.provider,
            account: selected.source.account,
            channel: selected.source.channel,
          })
        : [],
    [needYouQuery.data, selected]
  );

  const waiting = needYouQuery.data?.drafts.length ?? 0;
  const openNeedYou = () => setParams({ needYou: true });
  const loadFault = conversationsQuery.isError ? failureCode(conversationsQuery.error) : undefined;
  const badge = selected ? connectorBadge(selected.connector.state) : undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      <div className="h-6 shrink-0 [-webkit-app-region:drag]" />
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 px-8 pb-6">
        <PageLayout.Header
          title="Messages"
          description="Client conversations captured by Client Ops Core. Replies are saved as drafts; nothing is sent from here."
          actions={
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={openNeedYou}>
                {waiting > 0 ? `Need you (${waiting})` : 'Need you'}
              </Button>
            </div>
          }
        />
        {loadFault !== undefined && all === undefined ? (
          <NotAvailable code={loadFault} />
        ) : conversationsQuery.isPending ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 gap-6">
            <aside className="flex w-80 shrink-0 flex-col gap-3">
              <SearchInput
                aria-label="Search conversations"
                placeholder="Search client, channel or message…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onClear={() => setSearch('')}
              />
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant={showAll ? 'ghost' : 'secondary'}
                  onClick={() => setShowAll(false)}
                >
                  {`Needs you (${attention.length})`}
                </Button>
                <Button
                  size="sm"
                  variant={showAll ? 'secondary' : 'ghost'}
                  onClick={() => setShowAll(true)}
                >
                  {`All (${all?.length ?? 0})`}
                </Button>
              </div>
              {!showAll && attention.length === 0 && search.trim() === '' && (
                <p className="rounded-lg border border-border bg-background-1 px-3 py-3 text-sm text-foreground-muted">
                  Nothing needs you right now.
                </p>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ConversationList
                  groups={groups}
                  selectedId={selected?.id}
                  onSelect={(id) => setParams({ conversationId: id })}
                  searching={search.trim() !== ''}
                  replyStates={replyStates}
                />
                {conversationsQuery.data?.truncated && (
                  <p className="px-1 pt-2 text-xs text-foreground-muted">
                    Showing the most recent conversations only.
                  </p>
                )}
              </div>
            </aside>
            <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              {selected ? (
                <SubjectProvider
                  subject={clientThreadSubject({ conversationId: selected.id })}
                  fallback={null}
                >
                  <header className="flex shrink-0 items-center gap-2">
                    <ConnectorDot state={selected.connector.state} />
                    <h2 className="text-md min-w-0 truncate font-medium text-foreground">
                      {selected.source.clientName}
                    </h2>
                    <span className="min-w-0 truncate text-xs text-foreground-muted">
                      {channelLabel(selected)}
                    </span>
                    <span className="flex-1" />
                    {!isLocalConversation(selected.id) && (
                      <AskClaudeButton conversation={selected} />
                    )}
                    {badge && !badge.healthy && (
                      <Pill variant={badge.tone === 'error' ? 'error' : 'warning'}>
                        {badge.label}
                      </Pill>
                    )}
                  </header>
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <ThreadView
                      key={selected.id}
                      conversationId={selected.id}
                      channel={
                        selected.provider === 'whatsapp' ? selected.source.channel : undefined
                      }
                      coreless={isLocalConversation(selected.id)}
                      drafts={drafts}
                    />
                  </div>
                  <TriageSuggestion conversation={selected} />
                  <ReplyComposer
                    key={selected.id}
                    conversation={selected}
                    onOpenNeedYou={openNeedYou}
                  />
                </SubjectProvider>
              ) : (
                <EmptyState
                  bare
                  label="No conversation selected."
                  description="Pick a conversation to read it and write a reply."
                />
              )}
            </section>
          </div>
        )}
      </div>
      <NeedYouSheet
        open={params.needYou === true}
        onClose={() => setParams({ needYou: undefined })}
        conversations={all ?? []}
      />
    </div>
  );
}

export const messagesViewRuntime = defineViewRuntime(messagesViewDef, {
  slots: {
    wrap: ({ children }) => <>{children}</>,
    titlebar: () => <Titlebar leftSlot={<MessagesBreadcrumb />} />,
    main: () => <MessagesView />,
  },
});
