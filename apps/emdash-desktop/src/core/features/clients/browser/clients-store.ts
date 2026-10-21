import { QueryObserver, type QueryClient, type QueryObserverOptions } from '@tanstack/react-query';
import { autorun, computed, makeObservable, observable, runInAction } from 'mobx';
import {
  clientActivityQueryOptions,
  clientsQueryOptions,
  type ClientsQueryError,
} from '../api/browser/clients-queries';
import { groupProjectsByClient, type ClientProjectGroup } from '../api/client-groups';
import {
  matchProjectsToClients,
  normalizeRemoteUrl,
  type MatchableProject,
  type ProjectMatch,
} from '../api/match-projects';
import type { Client, ClientActivity, ClientsList } from '../api/schemas';

/** The part of a project store this slice reads. */
export type ClientsProjectSource = {
  readonly projects: ReadonlyMap<
    string,
    {
      readonly id: string;
      readonly data: { type: 'local' | 'ssh'; path: string } | null;
    }
  >;
};

/** A project's git repository, when its facts are available. */
export type ProjectRepositoryFacts = {
  /** The `origin` remote URL, or null when the repository has none (or is not loaded yet). */
  readonly originUrl: string | null;
  /** Starts loading the repository's remotes; they arrive through the observable above. */
  load(): Promise<void>;
};

export type ClientsStoreDeps = {
  queryClient: QueryClient;
  repositoryOf: (projectId: string) => ProjectRepositoryFacts | undefined;
  fetchClients?: () => Promise<ClientsList>;
  fetchActivity?: () => Promise<ClientActivity>;
};

export type ClientsGroup = ClientProjectGroup & {
  /** Sessions active now for this client; absent when Core does not report activity. */
  activeCount?: number;
};

/**
 * The owner's clients as Client Ops Core reports them, and the Emdash projects that belong to
 * each. Read-only: it never writes to Core, and projects keep their own store and order.
 */
export class ClientsStore {
  private clientsData: ClientsList | undefined = undefined;
  private activityData: ClientActivity | undefined = undefined;
  private readonly disposers: Array<() => void> = [];
  private readonly requestedRemotes = new Set<string>();

  constructor(
    private readonly source: ClientsProjectSource,
    private readonly deps: ClientsStoreDeps
  ) {
    makeObservable<ClientsStore, 'clientsData' | 'activityData' | 'candidates' | 'pathMatches'>(
      this,
      {
        clientsData: observable.ref,
        activityData: observable.ref,
        clients: computed,
        candidates: computed,
        pathMatches: computed,
        matches: computed,
      }
    );
  }

  start(): void {
    if (this.disposers.length > 0) return;
    this.observeQuery(
      clientsQueryOptions(this.deps.fetchClients),
      (data) => (this.clientsData = data)
    );
    this.observeQuery(
      clientActivityQueryOptions(this.deps.fetchActivity),
      (data) => (this.activityData = data)
    );
    this.disposers.push(autorun(() => this.requestRemotes()));
  }

  dispose(): void {
    for (const dispose of this.disposers.splice(0)) dispose();
  }

  get clients(): readonly Client[] {
    return this.clientsData?.clients ?? [];
  }

  /** Each local project's client, by path first and then by its `origin` remote. */
  get matches(): ReadonlyMap<string, ProjectMatch> {
    return matchProjectsToClients(
      this.clients,
      this.candidates.map((candidate) => ({
        ...candidate,
        originUrl: this.deps.repositoryOf(candidate.id)?.originUrl ?? null,
      }))
    );
  }

  activeCount(clientId: string): number | undefined {
    return this.activityData?.byClient[clientId];
  }

  /**
   * The sidebar's grouping: one group per client owning a project, then "Your projects".
   * Undefined while there is nothing to group, so the plain project list stays as it was.
   */
  groupProjects(orderedProjectIds: readonly string[]): ClientsGroup[] | undefined {
    return groupProjectsByClient(orderedProjectIds, this.matches, this.clients)?.map((group) => ({
      ...group,
      ...(group.clientId === undefined ? {} : { activeCount: this.activeCount(group.clientId) }),
    }));
  }

  private get candidates(): Omit<MatchableProject, 'originUrl'>[] {
    const candidates: Omit<MatchableProject, 'originUrl'>[] = [];
    for (const project of this.source.projects.values()) {
      if (!project.data) continue;
      candidates.push({
        id: project.id,
        path: project.data.path,
        local: project.data.type === 'local',
      });
    }
    return candidates;
  }

  private get pathMatches(): ReadonlyMap<string, ProjectMatch> {
    return matchProjectsToClients(
      this.clients,
      this.candidates.map((candidate) => ({ ...candidate, originUrl: null }))
    );
  }

  /** Remotes are only read for projects a path did not place, and only when a client registers one. */
  private requestRemotes(): void {
    const registersRemote = this.clients.some((client) =>
      client.projects.some((project) =>
        project.repos.some((repo) => normalizeRemoteUrl(repo) !== undefined)
      )
    );
    if (!registersRemote) return;
    const placed = this.pathMatches;
    for (const candidate of this.candidates) {
      if (placed.has(candidate.id) || this.requestedRemotes.has(candidate.id)) continue;
      const repository = this.deps.repositoryOf(candidate.id);
      if (!repository) continue;
      this.requestedRemotes.add(candidate.id);
      repository.load().catch(() => this.requestedRemotes.delete(candidate.id));
    }
  }

  private observeQuery<T>(
    options: QueryObserverOptions<T, ClientsQueryError>,
    assign: (data: T | undefined) => void
  ): void {
    const observer = new QueryObserver<T, ClientsQueryError>(this.deps.queryClient, options);
    const stop = observer.subscribe((result) => {
      // A failed refresh keeps the last good data so a brief Core outage does not reshuffle the
      // sidebar; losing the connection itself (disconnect, no identity) clears it.
      runInAction(() => assign(result.error?.code === 'not_connected' ? undefined : result.data));
    });
    this.disposers.push(stop);
  }
}
