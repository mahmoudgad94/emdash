import { EmptyState } from '@emdash/ui/react/components';
import { ListView, PageLayout } from '@emdash/ui/react/patterns';
import { Button, RelativeTime, Spinner } from '@emdash/ui/react/primitives';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  clientsQueryOptions,
  unlinkedClientsQueryOptions,
} from '@core/features/clients/api/browser/clients-queries';
import { needYouQueryOptions } from '@core/features/messaging/api/browser/messaging-queries';
import { useOwnLastReplies } from '@core/features/messaging/api/browser/own-replies';
import { useClientConversations } from '@core/features/messaging/api/browser/use-client-conversations';
import type { ConversationSummary } from '@core/features/messaging/api/schemas';
import { TriageHint } from '@core/features/messaging/contributions/triage-hint';
import { messagesViewDef } from '@core/features/messaging/contributions/views';
import { workSummaryQueryOptions } from '@core/features/observed-sessions/api/browser/observed-sessions-queries';
import { clientsViewDef } from '@core/features/observed-sessions/contributions/views';
import { settingsViewDef } from '@core/features/settings/contributions/views';
import { Titlebar } from '@core/features/workbench/contributions/browser/Titlebar';
import { useNavigate } from '@core/primitives/navigation/browser/navigation-hooks';
import { defineViewRuntime } from '@core/primitives/views/react';
import {
  buildToday,
  hostLabel,
  sourceLabel,
  summarizeToday,
  type ActiveClientCard,
  type LiveItem,
  type NeedsYouItem,
} from '../api/today-model';
import { todayViewDef } from '../contributions/views';

const NO_CONVERSATIONS: readonly ConversationSummary[] = [];

const AGREEMENTS: Record<string, string> = {
  retainer: 'Retainer',
  per_task: 'Per task',
  owned: 'Owned',
};

export function TodayBreadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center px-2">
      <span className="max-w-[14rem] truncate rounded-sm px-1 py-0.5 text-sm text-foreground">
        Today
      </span>
    </nav>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <ListView.SectionHeader label={title} count={count} />
      <div className="overflow-hidden rounded-lg border border-border bg-background-1">
        {children}
      </div>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-2.5 text-xs text-foreground-muted">{children}</p>;
}

function Dot({ tone }: { tone: 'warning' | 'info' | 'success' }) {
  const color =
    tone === 'warning'
      ? 'bg-foreground-warning'
      : tone === 'info'
        ? 'bg-foreground-info'
        : 'bg-foreground-success';
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${color}`} />;
}

function NeedsYouRow({
  item,
  isLast,
  onOpen,
}: {
  item: NeedsYouItem;
  isLast: boolean;
  onOpen: () => void;
}) {
  return (
    <ListView.Row bare isLast={isLast} divider="subtle">
      <div className="flex min-h-14 items-center gap-3 px-3 py-2">
        <Dot tone="warning" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium text-foreground">{item.clientName}</span>
            <span className="truncate text-xs text-foreground-muted">
              {item.waiting > 1 ? `${item.from}, ${item.waiting} unanswered` : item.from}
            </span>
          </div>
          <span className="truncate text-xs text-foreground-muted">
            {item.preview.replace(/\s+/g, ' ').trim()}
          </span>
          <TriageHint conversationId={item.conversationId} />
        </div>
        {item.at && (
          <RelativeTime
            value={item.at}
            compact
            className="shrink-0 text-[11px] text-foreground-passive tabular-nums"
          />
        )}
        <Button variant="secondary" size="sm" onClick={onOpen}>
          Reply
        </Button>
      </div>
    </ListView.Row>
  );
}

function LiveRow({ item, isLast }: { item: LiveItem; isLast: boolean }) {
  return (
    <ListView.Row bare isLast={isLast} divider="subtle">
      <div className="flex min-h-10 items-center gap-3 px-3 py-1.5">
        <Dot tone="success" />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {item.clientName}
          <span className="text-foreground-muted">
            {` ${sourceLabel(item.source)}${item.branch ? `, ${item.branch}` : ''}, ${hostLabel(item.host)}`}
          </span>
        </span>
        <RelativeTime
          value={item.endedAt}
          compact
          className="shrink-0 text-[11px] text-foreground-passive tabular-nums"
        />
      </div>
    </ListView.Row>
  );
}

function ClientCard({ card, onOpen }: { card: ActiveClientCard; onOpen: () => void }) {
  const parts = [
    card.agreement ? (AGREEMENTS[card.agreement] ?? card.agreement) : 'No agreement',
    card.live > 0 ? `${card.live} live` : null,
    card.waiting > 0 ? `${card.waiting} waiting` : null,
  ].filter((part): part is string => part !== null);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-background-1 px-3 py-2.5 text-left hover:bg-background-2"
    >
      <span className="truncate text-sm font-medium text-foreground">{card.name}</span>
      <span className="truncate text-xs text-foreground-muted">{parts.join(', ')}</span>
    </button>
  );
}

export function TodayView() {
  const { navigate } = useNavigate();
  const { conversations: allConversations, query: conversations } = useClientConversations();
  const needYou = useQuery(needYouQueryOptions());
  const summary = useQuery(workSummaryQueryOptions());
  const clients = useQuery(clientsQueryOptions());
  const unlinked = useQuery(unlinkedClientsQueryOptions());
  const ownReplies = useOwnLastReplies(allConversations ?? NO_CONVERSATIONS);

  const model = useMemo(
    () =>
      buildToday({
        conversations: allConversations ?? [],
        drafts: needYou.data?.drafts ?? [],
        sessions: summary.data?.active ?? [],
        clients: clients.data?.clients ?? [],
        unlinked: unlinked.data?.clients ?? [],
        ownReplies,
      }),
    [allConversations, needYou.data, summary.data, clients.data, unlinked.data, ownReplies]
  );

  const unreachable =
    conversations.isError && clients.isError && summary.isError && needYou.isError;
  const loading = conversations.isPending && clients.isPending && summary.isPending;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background text-foreground">
      <div className="h-6 shrink-0 [-webkit-app-region:drag]" />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-8 pb-10">
        <PageLayout.Header
          title="Today"
          description={
            loading || unreachable
              ? 'What needs you, what is running, and who you are working for.'
              : summarizeToday(model)
          }
        />
        {unreachable ? (
          <EmptyState
            label="Client Ops Core is not reachable."
            description="Connect this app to Core, then this page fills in."
            action={
              <Button
                variant="secondary"
                onClick={() => navigate(settingsViewDef({ tab: 'clientops-core' }))}
              >
                Open Client Ops Core settings
              </Button>
            }
          />
        ) : loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            <Section title="Needs you" count={model.needsYou.length + (model.drafts > 0 ? 1 : 0)}>
              {model.needsYou.length === 0 && model.drafts === 0 ? (
                <Note>Nothing needs you right now.</Note>
              ) : (
                <>
                  {model.needsYou.map((item, index) => (
                    <NeedsYouRow
                      key={item.key}
                      item={item}
                      isLast={index === model.needsYou.length - 1 && model.drafts === 0}
                      onOpen={() =>
                        navigate(messagesViewDef({ conversationId: item.conversationId }))
                      }
                    />
                  ))}
                  {model.drafts > 0 && (
                    <ListView.Row bare isLast divider="subtle">
                      <div className="flex min-h-14 items-center gap-3 px-3 py-2">
                        <Dot tone="info" />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium text-foreground">
                            Draft waiting for your Touch ID
                          </span>
                          <span className="truncate text-xs text-foreground-muted">
                            {model.drafts === 1
                              ? '1 reply is saved and ready to approve.'
                              : `${model.drafts} replies are saved and ready to approve.`}
                          </span>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(messagesViewDef({ needYou: true }))}
                        >
                          Open approval
                        </Button>
                      </div>
                    </ListView.Row>
                  )}
                </>
              )}
            </Section>
            {model.heldStrangers > 0 && (
              <p className="-mt-3 px-1 text-xs text-foreground-muted">
                {model.heldStrangers} messages from senders Core does not know are held back and
                hidden.{' '}
                <button
                  type="button"
                  className="text-foreground underline-offset-2 hover:underline"
                  onClick={() => navigate(messagesViewDef())}
                >
                  Review
                </button>
              </p>
            )}

            <Section title="Live now" count={model.live.length}>
              {model.live.length === 0 ? (
                <Note>No Claude Code or Codex sessions are running.</Note>
              ) : (
                model.live.map((item, index) => (
                  <LiveRow key={item.id} item={item} isLast={index === model.live.length - 1} />
                ))
              )}
            </Section>

            <section className="flex flex-col gap-1.5">
              <ListView.SectionHeader label="Active clients" count={model.clients.length} />
              {model.clients.length === 0 ? (
                <Note>No active clients.</Note>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2">
                  {model.clients.map((card) => (
                    <ClientCard
                      key={card.id}
                      card={card}
                      onOpen={() => navigate(clientsViewDef({ clientId: card.id }))}
                    />
                  ))}
                  {model.unlinked > 0 && (
                    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-dashed border-border px-3 py-2.5">
                      <span className="truncate text-sm text-foreground-muted">
                        {model.unlinked} more {model.unlinked === 1 ? 'is' : 'are'} active on the
                        dashboard
                      </span>
                      <span className="text-xs text-foreground-passive">Not set up yet</span>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export const todayViewRuntime = defineViewRuntime(todayViewDef, {
  slots: {
    wrap: ({ children }) => <>{children}</>,
    titlebar: () => <Titlebar leftSlot={<TodayBreadcrumb />} />,
    main: () => <TodayView />,
  },
});
