import { Pill } from '@emdash/ui/react/components';
import { ListView } from '@emdash/ui/react/patterns';
import { Button, RelativeTime, toast } from '@emdash/ui/react/primitives';
import { useQuery } from '@tanstack/react-query';
import { observer } from 'mobx-react-lite';
import { useMemo, useState } from 'react';
import { getMachinesStore } from '@core/features/machines/contributions/app-stores';
import {
  connectorsQueryOptions,
  conversationsQueryOptions,
} from '@core/features/messaging/api/browser/messaging-queries';
import { channelLabel, connectorBadge, providerLabel } from '@core/features/messaging/api/labels';
import { summarizeProviders } from '@core/features/messaging/api/providers';
import { messagesViewDef } from '@core/features/messaging/contributions/views';
import { getProjectManagerStore } from '@core/features/projects/api/browser/stores/project-selectors';
import { projectViewDef } from '@core/features/projects/contributions/views';
import { useNavigate } from '@core/primitives/navigation/browser/navigation-hooks';
import { clientWorkQueryOptions, repoInspectionQueryOptions } from '../api/browser/clients-queries';
import { formatMinor } from '../api/money';
import { placeRepos, repoBasename, type PlacedRepo, type RepoGroup } from '../api/repo-placement';
import type { Client, ClientChannel } from '../api/schemas';

/** A session running for the client right now, as the Clients view reads it from Core. */
export type LiveClientSession = {
  id: string;
  host: string;
  source: string;
  branch: string | null;
  toolCalls: number | null;
  endedAt: string;
};

const SOURCE_LABELS: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', git: 'Git' };
const hostLabel = (host: string) => (host === 'local-mac' ? 'This Mac' : host.replace(/^ssh-/, ''));

const AGREEMENTS: Record<string, string> = {
  retainer: 'Retainer',
  per_task: 'Per task',
  owned: 'Owned',
};

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {aside}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-background-1">
        {children}
      </div>
    </section>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-2.5 text-xs text-foreground-muted">{children}</p>;
}

const RepoRow = observer(function RepoRow({
  repo,
  group,
  clientName,
  isLast,
}: {
  repo: PlacedRepo;
  group: RepoGroup;
  clientName: string;
  isLast: boolean;
}) {
  const { navigate } = useNavigate();
  const [adding, setAdding] = useState(false);
  const canAdd = repo.host.kind === 'local' || repo.host.kind === 'ssh';

  const add = async () => {
    setAdding(true);
    try {
      const type =
        repo.host.kind === 'ssh'
          ? ({ type: 'ssh', connectionId: repo.host.connectionId } as const)
          : ({ type: 'local' } as const);
      const projectId = await getProjectManagerStore().createProject(type, {
        mode: 'pick',
        name: repoBasename(repo.repo),
        path: repo.repo,
      });
      if (projectId === undefined) {
        toast.error('Could not add the project', { description: repo.repo });
        return;
      }
      navigate(projectViewDef({ projectId }));
    } finally {
      setAdding(false);
    }
  };

  return (
    <ListView.Row bare isLast={isLast} divider="subtle">
      <div className="flex min-h-10 items-center gap-3 px-3 py-1.5">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-foreground">{repoBasename(repo.repo)}</span>
          <span className="truncate text-xs text-foreground-muted" title={repo.repo}>
            {repo.repo}
          </span>
        </div>
        <span className="sr-only">{`${clientName} · ${group.label}`}</span>
        {repo.projectId !== null ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(projectViewDef({ projectId: repo.projectId! }))}
          >
            Open
          </Button>
        ) : canAdd ? (
          <Button variant="secondary" size="sm" disabled={adding} onClick={add}>
            {adding ? 'Adding…' : 'Add'}
          </Button>
        ) : null}
      </div>
    </ListView.Row>
  );
});

const COLLAPSED_REPOS = 4;

/** One machine's repositories: a short list that expands, and one click to open them all. */
const RepoGroupBlock = observer(function RepoGroupBlock({
  group,
  clientName,
}: {
  group: RepoGroup;
  clientName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const addable = group.host.kind === 'local' || group.host.kind === 'ssh';
  const pending = group.repos.filter((repo) => repo.projectId === null);
  const shown = expanded ? group.repos : group.repos.slice(0, COLLAPSED_REPOS);

  const addAll = async () => {
    setBusy(true);
    let failed = 0;
    try {
      for (const repo of pending) {
        const type =
          repo.host.kind === 'ssh'
            ? ({ type: 'ssh', connectionId: repo.host.connectionId } as const)
            : ({ type: 'local' } as const);
        const id = await getProjectManagerStore().createProject(type, {
          mode: 'pick',
          name: repoBasename(repo.repo),
          path: repo.repo,
        });
        if (id === undefined) failed += 1;
      }
      if (failed > 0) toast.error(`${failed} of ${pending.length} projects could not be added`);
      else toast.success(`Added ${pending.length} projects`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 pr-3">
        <div className="min-w-0 flex-1">
          <ListView.SectionHeader label={group.label} count={group.repos.length} />
        </div>
        {addable && pending.length > 0 && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={addAll}>
            {busy ? 'Adding…' : `Add all (${pending.length})`}
          </Button>
        )}
      </div>
      {shown.map((repo, index) => (
        <RepoRow
          key={repo.repo}
          repo={repo}
          group={group}
          clientName={clientName}
          isLast={index === shown.length - 1 && group.repos.length <= COLLAPSED_REPOS}
        />
      ))}
      {group.repos.length > COLLAPSED_REPOS && (
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-xs text-foreground-muted hover:text-foreground"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show fewer' : `Show ${group.repos.length - COLLAPSED_REPOS} more`}
        </button>
      )}
    </div>
  );
});

const ProjectsSection = observer(function ProjectsSection({ client }: { client: Client }) {
  const repos = useMemo(
    () => [...new Set(client.projects.flatMap((project) => project.repos))],
    [client.projects]
  );
  const inspection = useQuery({ ...repoInspectionQueryOptions(repos), enabled: repos.length > 0 });
  const machines = getMachinesStore().connections;
  const projects = [...getProjectManagerStore().projects.values()].flatMap((store) =>
    store.data
      ? [
          {
            id: store.id,
            type: store.data.type,
            path: store.data.path,
            connectionId: store.data.type === 'ssh' ? store.data.connectionId : undefined,
          },
        ]
      : []
  );
  // Cheap to recompute, and the observable stores it reads change identity on every edit.
  const groups = placeRepos(
    inspection.data?.repos ?? [],
    machines.map((machine) => ({ id: machine.id, name: machine.name, username: machine.username })),
    projects
  );

  return (
    <Section
      title="Projects"
      aside={
        <span className="text-xs text-foreground-passive tabular-nums">{repos.length} repos</span>
      }
    >
      {repos.length === 0 ? (
        <Muted>No repositories are registered for this client yet.</Muted>
      ) : inspection.isPending ? (
        <Muted>Looking for these repositories…</Muted>
      ) : groups.length === 0 ? (
        <Muted>Could not tell where these repositories live.</Muted>
      ) : (
        groups.map((group) => (
          <RepoGroupBlock key={group.key} group={group} clientName={client.name} />
        ))
      )}
    </Section>
  );
});

function ChannelRow({
  channel,
  client,
  isLast,
}: {
  channel: ClientChannel;
  client: Client;
  isLast: boolean;
}) {
  const { navigate } = useNavigate();
  const conversations = useQuery(conversationsQueryOptions());
  const conversation = conversations.data?.conversations.find(
    (entry) => entry.source.channelId === channel.id
  );
  const projectName = client.projects.find((project) => project.id === channel.projectId)?.name;
  const badge = connectorBadge(conversation?.connector.state ?? null);
  const last = conversation?.lastMessage;
  return (
    <ListView.Row
      bare
      interactive={conversation !== undefined}
      isLast={isLast}
      divider="subtle"
      onClick={
        conversation
          ? () => navigate(messagesViewDef({ conversationId: conversation.id }))
          : undefined
      }
    >
      <div className="flex min-h-12 items-center gap-3 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm text-foreground">
            {conversation
              ? channelLabel(conversation)
              : `${providerLabel(channel.provider)}${channel.context === 'shared_group' ? ' group' : ''} · ${projectName ?? 'Project'}`}
          </span>
          <span className="truncate text-xs text-foreground-muted">
            {last
              ? `${last.sender}: ${last.text.replace(/\s+/g, ' ').trim()}`
              : 'No messages captured yet'}
          </span>
        </div>
        {last?.at && (
          <RelativeTime
            value={last.at}
            compact
            className="shrink-0 text-[11px] text-foreground-passive tabular-nums"
          />
        )}
        {conversation && (
          <Pill variant={badge.tone === 'neutral' ? 'neutral' : badge.tone} dot>
            {badge.label}
          </Pill>
        )}
      </div>
    </ListView.Row>
  );
}

function ChannelsSection({ client }: { client: Client }) {
  const connectors = useQuery(connectorsQueryOptions());
  const providers = summarizeProviders(connectors.data?.connectors ?? []);
  const missing = connectors.isSuccess ? providers.filter((status) => !status.configured) : [];
  return (
    <Section
      title="Communication"
      aside={
        missing.length > 0 ? (
          <span className="text-xs text-foreground-passive">
            {missing.map((status) => providerLabel(status.provider)).join(' and ')} not connected to
            Core
          </span>
        ) : undefined
      }
    >
      {client.channels.length === 0 ? (
        <Muted>No channels are registered for this client yet.</Muted>
      ) : (
        client.channels.map((channel, index) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            client={client}
            isLast={index === client.channels.length - 1}
          />
        ))
      )}
    </Section>
  );
}

function ActiveNowSection({ sessions }: { sessions: readonly LiveClientSession[] }) {
  if (sessions.length === 0) return null;
  return (
    <Section
      title="Active now"
      aside={
        <Pill variant="success" dot>
          {sessions.length} live
        </Pill>
      }
    >
      {sessions.map((session, index) => (
        <ListView.Row key={session.id} bare isLast={index === sessions.length - 1} divider="subtle">
          <div className="flex min-h-10 items-center gap-3 px-3 py-1.5">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm text-foreground">
                {SOURCE_LABELS[session.source] ?? session.source}
                {session.branch ? ` · ${session.branch}` : ''}
              </span>
              <span className="truncate text-xs text-foreground-muted">
                {hostLabel(session.host)}
                {session.toolCalls !== null ? ` · ${session.toolCalls} tool calls` : ''}
              </span>
            </div>
            <RelativeTime
              value={session.endedAt}
              compact
              className="shrink-0 text-[11px] text-foreground-passive tabular-nums"
            />
          </div>
        </ListView.Row>
      ))}
    </Section>
  );
}

function BusinessSection({ client }: { client: Client }) {
  const work = useQuery(clientWorkQueryOptions(client.id));
  const data = work.data;
  return (
    <Section
      title="Contracts and payments"
      aside={
        data?.asOf ? (
          <span className="text-xs text-foreground-passive">
            {data.stale ? 'Out of date · ' : ''}
            <RelativeTime value={data.asOf} compact />
          </span>
        ) : undefined
      }
    >
      {work.isPending ? (
        <Muted>Reading the dashboard…</Muted>
      ) : work.isError ? (
        <Muted>The dashboard is not available right now.</Muted>
      ) : !data?.linked ? (
        <Muted>This client is not linked to a dashboard client.</Muted>
      ) : (
        <>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex-1 text-sm text-foreground">
              {data.payments.count} {data.payments.count === 1 ? 'payment' : 'payments'}
            </span>
            <span className="text-sm text-foreground tabular-nums">
              {formatMinor(data.payments.totalMinor, data.payments.currency)}
            </span>
          </div>
          {data.contracts.length === 0 ? (
            <Muted>No contracts on the dashboard.</Muted>
          ) : (
            data.contracts.map((contract, index) => (
              <ListView.Row
                key={contract.ref}
                bare
                isLast={index === data.contracts.length - 1}
                divider="subtle"
              >
                <div className="flex min-h-9 items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {contract.label}
                  </span>
                  {contract.state && (
                    <Pill variant={contract.state === 'active' ? 'success' : 'neutral'}>
                      {contract.state}
                    </Pill>
                  )}
                </div>
              </ListView.Row>
            ))
          )}
        </>
      )}
    </Section>
  );
}

/** What Core registered for one client, laid out as the owner works: code, conversations, money. */
export function ClientPage({
  client,
  live = [],
}: {
  client: Client;
  live?: readonly LiveClientSession[];
}) {
  const agreement = client.agreement ? (AGREEMENTS[client.agreement] ?? client.agreement) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-md font-medium text-foreground">{client.name}</h2>
        {agreement && <Pill variant="neutral">{agreement}</Pill>}
        {client.status === 'inactive' && <Pill variant="warning">Inactive</Pill>}
        {client.people.length > 0 && (
          <span className="text-xs text-foreground-muted">
            {client.people.map((person) => person.name).join(', ')}
          </span>
        )}
      </div>
      <ActiveNowSection sessions={live} />
      <ChannelsSection client={client} />
      <BusinessSection client={client} />
      <ProjectsSection client={client} />
    </div>
  );
}
