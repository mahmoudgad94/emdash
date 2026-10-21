import { clientsStoreToken } from '@core/features/clients/contributions/app-store-tokens';
import { projectManagerStoreToken } from '@core/features/projects/contributions/app-store-tokens';
import { getGitRepositoryStore } from '@core/features/source-control/api/browser/stores/source-control-selectors';
import { queryClient } from '@core/primitives/query/browser/query-client';
import {
  contributeScopedStore,
  type AppScopedStoreContribution,
} from '@core/primitives/scoped-stores/browser';
import { ClientsStore } from '../browser/clients-store';

// Resolves the projects store at create time, so the projects contribution must come first in
// the app-scope manifest.
export const clientsAppStoreContributions: readonly AppScopedStoreContribution[] = [
  contributeScopedStore({
    token: clientsStoreToken,
    create: (_context, stores) =>
      new ClientsStore(stores.get(projectManagerStoreToken), {
        queryClient,
        repositoryOf: (projectId) => {
          const repository = getGitRepositoryStore(projectId);
          if (!repository) return undefined;
          return {
            originUrl: repository.remotes.find((remote) => remote.name === 'origin')?.url ?? null,
            load: () => repository.remoteData.load(),
          };
        },
      }),
    activate: (store) => store.start(),
    dispose: (store) => store.dispose(),
  }),
];
