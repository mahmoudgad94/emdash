import { EmptyState } from '@emdash/ui/react/components';
import {
  CollectionToolbar,
  CollectionView,
  ListView,
  PageLayout,
  SortSelect,
  useQueryListSource,
} from '@emdash/ui/react/patterns';
import { Button } from '@emdash/ui/react/primitives';
import { useQuery } from '@tanstack/react-query';
import { observer } from 'mobx-react-lite';
import { useMemo, useState } from 'react';
import { clientsQueryOptions } from '@core/features/clients/api/browser/clients-queries';
import { settingsViewDef } from '@core/features/settings/contributions/views';
import { Titlebar } from '@core/features/workbench/contributions/browser/Titlebar';
import { useSearchFocusHotkeys } from '@core/primitives/keybindings/browser';
import {
  useCurrentViewParams,
  useNavigate,
} from '@core/primitives/navigation/browser/navigation-hooks';
import { defineViewRuntime } from '@core/primitives/views/react';
import {
  ObservedSessionsQueryError,
  sessionListQueryOptions,
  workSummaryQueryOptions,
} from '../api/browser/observed-sessions-queries';
import { buildClientRail, defaultScope } from '../api/client-rail';
import { describeSessionsFailure } from '../api/failure-messages';
import type { ObservedSession } from '../api/schemas';
import { findSessionInfo, sessionInfoOf } from '../api/session-info';
import {
  OWN_SCOPE,
  scopeFromParams,
  scopeKey,
  scopeToParams,
  type SessionScope,
} from '../api/session-scope';
import { clientsViewDef } from '../contributions/views';
import { ClientRailList } from './client-rail-list';
import { LIVE_COLUMNS, SESSION_COLUMNS } from './session-columns';
import { createSessionListView, type SessionListViewModel } from './session-list-model';
import { SessionTranscriptSheet } from './session-transcript-sheet';

const LIVE_ROW_PX = 36;
const LIVE_MAX_ROWS = 5;

/**
 * The code behind a failed query. The clients and sessions slices throw their own error classes,
 * so the code is read off any error that carries one rather than by instance.
 */
function failureCode(error: unknown): string {
  if (error instanceof ObservedSessionsQueryError) return error.code;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') return 'unknown';
  return code === 'unconfigured' ? 'not_connected' : code;
}

export function ClientsBreadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center px-2">
      <span className="max-w-[14rem] truncate rounded-sm px-1 py-0.5 text-sm text-foreground">
        Clients
      </span>
    </nav>
  );
}

const SessionsToolbar = observer(function SessionsToolbar({
  view,
  total,
}: {
  view: SessionListViewModel;
  total: number;
}) {
  const search = view.useSearch();
  const sort = view.useSort();
  const searchRef = useSearchFocusHotkeys();
  return (
    <CollectionToolbar.Root>
      <CollectionToolbar.Search
        ref={searchRef}
        value={search.query}
        onValueChange={search.setQuery}
        placeholder="Search by tool, machine, branch or commit…"
      />
      <CollectionToolbar.Spacer />
      <CollectionToolbar.Group>
        <span className="text-xs text-foreground-passive tabular-nums">
          {total} {total === 1 ? 'session' : 'sessions'}
        </span>
        <SortSelect sort={sort} />
      </CollectionToolbar.Group>
    </CollectionToolbar.Root>
  );
});

const EmptySessions = observer(function EmptySessions({
  view,
  total,
  scope,
}: {
  view: SessionListViewModel;
  total: number;
  scope: SessionScope;
}) {
  const searching = view.useSearch().query.length > 0;
  if (searching && total > 0) return <EmptyState bare label="No sessions match your search." />;
  return (
    <EmptyState
      bare
      label="No sessions captured yet."
      description={
        scope.kind === 'unmatched'
          ? 'Sessions that match none of your clients show up here.'
          : 'Claude Code and Codex sessions appear here once Core captures them.'
      }
    />
  );
});

function NotConnected({ code }: { code: string }) {
  const { navigate } = useNavigate();
  const failure = describeSessionsFailure(code);
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

export function ClientsView() {
  const { params, setParams } = useCurrentViewParams(clientsViewDef);
  const clientsQuery = useQuery(clientsQueryOptions());
  const summaryQuery = useQuery(workSummaryQueryOptions());

  const clients = clientsQuery.data?.clients;
  const summary = summaryQuery.data;
  const rail = useMemo(() => buildClientRail(clients ?? [], summary), [clients, summary]);
  const clientNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const entry of summary?.clients ?? []) {
      if (entry.clientId !== null && entry.clientName) names.set(entry.clientId, entry.clientName);
    }
    for (const client of clients ?? []) names.set(client.id, client.name);
    return names;
  }, [clients, summary]);

  // Without a chosen scope, wait for the first client/summary answer before picking a default so a
  // list for the wrong scope is never fetched.
  const settled = !clientsQuery.isPending || !summaryQuery.isPending;
  const chosen = scopeFromParams(params);
  const scope: SessionScope | undefined = chosen ?? (settled ? defaultScope(rail) : undefined);
  const listQuery = useQuery({
    ...sessionListQueryOptions(scope ?? OWN_SCOPE),
    enabled: scope !== undefined,
  });

  const source = useQueryListSource(
    {
      data: listQuery.data,
      isLoading: listQuery.isLoading || scope === undefined,
      isError: listQuery.isError,
      error: listQuery.error,
    },
    (data) => data.items
  );
  const [view] = useState(() => createSessionListView(source));

  const total = listQuery.data?.items.length ?? 0;
  const scopeLabel =
    [...rail.clients, rail.own, rail.unmatched].find(
      (entry) => scope !== undefined && scopeKey(entry.scope) === scopeKey(scope)
    )?.label ?? 'Sessions';
  const live = useMemo(
    () => (summary?.active ?? []).map((session) => sessionInfoOf(session, clientNames)),
    [summary, clientNames]
  );
  const openInfo =
    params.sessionId === undefined
      ? undefined
      : findSessionInfo(
          params.sessionId,
          listQuery.data?.items ?? [],
          summary?.active ?? [],
          clientNames
        );

  const select = (next: SessionScope) =>
    setParams({ ...scopeToParams(next), sessionId: undefined });
  const open = (id: string) => setParams({ sessionId: id });

  // Either query refusing for a connection reason means the whole view cannot work yet.
  const connectionFault = [clientsQuery.error, summaryQuery.error]
    .filter((error) => error !== null && error !== undefined)
    .map(failureCode)
    .find((code) => code === 'not_connected' || code === 'policy_denied');

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      <div className="h-6 shrink-0 [-webkit-app-region:drag]" />
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 px-8 pb-6">
        <PageLayout.Header
          title="Clients"
          description="Claude Code and Codex sessions captured by Client Ops Core, on this Mac and the dev server. Read only."
        />
        {connectionFault !== undefined ? (
          <NotConnected code={connectionFault} />
        ) : (
          <div className="flex min-h-0 flex-1 gap-6">
            <aside className="w-64 shrink-0 overflow-y-auto">
              <ClientRailList rail={rail} selected={scope ?? OWN_SCOPE} onSelect={select} />
            </aside>
            <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
              {live.length > 0 && (
                <div className="flex shrink-0 flex-col gap-1.5">
                  <ListView.SectionHeader label="Live now" count={live.length} />
                  <div
                    style={{
                      height: Math.min(live.length, LIVE_MAX_ROWS) * LIVE_ROW_PX + 2,
                    }}
                  >
                    <CollectionView
                      items={live}
                      getItemKey={(session) => session.id}
                      columns={LIVE_COLUMNS}
                      density="compact"
                      onItemClick={(session) => open(session.id)}
                    />
                  </div>
                </div>
              )}
              <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                <h2 className="text-md font-medium text-foreground">{scopeLabel}</h2>
                <div className="min-h-0 flex-1">
                  <view.Root>
                    <CollectionView
                      view={view}
                      columns={SESSION_COLUMNS}
                      density="compact"
                      toolbar={<SessionsToolbar view={view} total={total} />}
                      onItemClick={(session: ObservedSession) => open(session.id)}
                      errorSlot={
                        listQuery.isError ? (
                          <EmptyState
                            bare
                            label={describeSessionsFailure(failureCode(listQuery.error)).title}
                            description={
                              describeSessionsFailure(failureCode(listQuery.error)).detail
                            }
                          />
                        ) : undefined
                      }
                      emptySlot={
                        <EmptySessions view={view} total={total} scope={scope ?? OWN_SCOPE} />
                      }
                    />
                  </view.Root>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
      <SessionTranscriptSheet
        sessionId={params.sessionId}
        info={openInfo}
        onClose={() => setParams({ sessionId: undefined })}
      />
    </div>
  );
}

export const clientsViewRuntime = defineViewRuntime(clientsViewDef, {
  slots: {
    wrap: ({ children }) => <>{children}</>,
    titlebar: () => <Titlebar leftSlot={<ClientsBreadcrumb />} />,
    main: () => <ClientsView />,
  },
});
