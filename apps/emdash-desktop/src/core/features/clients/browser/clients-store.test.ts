import { QueryClient } from '@tanstack/react-query';
import { observable, runInAction } from 'mobx';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientsQueryError } from '../api/browser/clients-queries';
import type { ClientActivity, ClientsList } from '../api/schemas';
import {
  ClientsStore,
  type ClientsProjectSource,
  type ProjectRepositoryFacts,
} from './clients-store';

vi.mock('../api/browser/client', () => ({ getClientsClient: vi.fn() }));

type Project = {
  id: string;
  data: { type: 'local' | 'ssh'; path: string } | null;
};

const list: ClientsList = {
  clients: [
    {
      id: 'acme',
      name: 'Acme',
      agreement: 'retainer',
      status: 'active',
      dashboardRef: null,
      people: [],
      channels: [],
      projects: [
        {
          id: 'site',
          name: 'Site',
          repos: ['/work/acme/site', 'git@github.com:acme/api.git'],
          environments: [],
        },
      ],
    },
  ],
};

const stores: ClientsStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
});

function setup(options?: {
  fetchClients?: () => Promise<ClientsList>;
  fetchActivity?: () => Promise<ClientActivity>;
}) {
  const projects = observable.map<string, Project>();
  const origins = observable.map<string, string | null>();
  const loaded: string[] = [];
  const repositoryOf = vi.fn((id: string): ProjectRepositoryFacts | undefined =>
    projects.has(id)
      ? {
          get originUrl() {
            return origins.get(id) ?? null;
          },
          load: async () => {
            loaded.push(id);
          },
        }
      : undefined
  );
  const store = new ClientsStore({ projects } as unknown as ClientsProjectSource, {
    queryClient: new QueryClient(),
    repositoryOf,
    fetchClients: options?.fetchClients ?? (async () => list),
    fetchActivity:
      options?.fetchActivity ?? (async () => ({ activeNow: 2, byClient: { acme: 2 } })),
  });
  stores.push(store);
  const add = (project: Project) =>
    runInAction(() => {
      projects.set(project.id, project);
    });
  return { store, add, origins, loaded };
}

const queryClientOf = (store: ClientsStore) =>
  (store as unknown as { deps: { queryClient: QueryClient } }).deps.queryClient;

describe('ClientsStore', () => {
  it('groups nothing until Core has reported clients', async () => {
    const { store, add } = setup({
      fetchClients: () => new Promise(() => undefined),
    });
    add({ id: 'p1', data: { type: 'local', path: '/work/acme/site' } });
    store.start();
    expect(store.groupProjects(['p1'])).toBeUndefined();
  });

  it('groups projects under their client by path and counts live sessions', async () => {
    const { store, add } = setup();
    add({ id: 'p1', data: { type: 'local', path: '/work/acme/site/app' } });
    add({ id: 'p2', data: { type: 'local', path: '/work/mine/blog' } });
    store.start();

    await vi.waitFor(() => expect(store.groupProjects(['p1', 'p2'])).toBeDefined());
    await vi.waitFor(() => expect(store.activeCount('acme')).toBe(2));

    expect(store.groupProjects(['p1', 'p2'])).toEqual([
      {
        key: 'client:acme',
        label: 'Acme',
        clientId: 'acme',
        projectIds: ['p1'],
        activeCount: 2,
      },
      { key: 'own', label: 'Your projects', projectIds: ['p2'] },
    ]);
  });

  it('places a project by its origin remote once the repository reports it, and only loads remotes for unplaced projects', async () => {
    const { store, add, origins, loaded } = setup();
    add({ id: 'placed', data: { type: 'local', path: '/work/acme/site' } });
    add({ id: 'other', data: { type: 'local', path: '/work/elsewhere/api' } });
    store.start();

    await vi.waitFor(() => expect(loaded).toEqual(['other']));
    expect(store.matches.get('other')).toBeUndefined();

    runInAction(() => origins.set('other', 'https://github.com/acme/api'));
    expect(store.matches.get('other')).toMatchObject({
      clientId: 'acme',
      by: 'remote',
    });
    expect(store.groupProjects(['placed', 'other'])?.[0]?.projectIds).toEqual(['placed', 'other']);
  });

  it('follows projects as they are added', async () => {
    const { store, add } = setup();
    store.start();
    await vi.waitFor(() => expect(store.clients).toHaveLength(1));
    expect(store.groupProjects(['p1'])).toBeUndefined();

    add({ id: 'p1', data: { type: 'local', path: '/work/acme/site' } });
    expect(store.groupProjects(['p1'])?.[0]?.label).toBe('Acme');
  });

  it('keeps showing the last clients while Core is briefly unreachable but drops them when disconnected', async () => {
    let failure: ClientsQueryError | undefined;
    const { store, add } = setup({
      fetchClients: async () => {
        if (failure) throw failure;
        return list;
      },
    });
    add({ id: 'p1', data: { type: 'local', path: '/work/acme/site' } });
    store.start();
    await vi.waitFor(() => expect(store.clients).toHaveLength(1));

    const queryClient = queryClientOf(store);
    failure = new ClientsQueryError('unreachable', 'Core is not reachable');
    await queryClient.refetchQueries({
      queryKey: ['clientops-core', 'clients'],
    });
    expect(store.clients).toHaveLength(1);

    failure = new ClientsQueryError('not_connected', 'Client Ops Core is not set up');
    await queryClient.refetchQueries({
      queryKey: ['clientops-core', 'clients'],
    });
    await vi.waitFor(() => expect(store.clients).toHaveLength(0));
    expect(store.groupProjects(['p1'])).toBeUndefined();
  });

  it('shows no badge when Core refuses the activity summary', async () => {
    const { store, add } = setup({
      fetchActivity: async () => {
        throw new ClientsQueryError('policy_denied', 'owner only');
      },
    });
    add({ id: 'p1', data: { type: 'local', path: '/work/acme/site' } });
    store.start();
    await vi.waitFor(() => expect(store.groupProjects(['p1'])).toBeDefined());
    await vi.waitFor(() =>
      expect(queryClientOf(store).getQueryState(['clientops-core', 'activity'])?.status).toBe(
        'error'
      )
    );
    expect(store.groupProjects(['p1'])?.[0]?.activeCount).toBeUndefined();
  });
});
