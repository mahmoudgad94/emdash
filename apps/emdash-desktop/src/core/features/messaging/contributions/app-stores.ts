import { clientsStoreToken } from '@core/features/clients/contributions/app-store-tokens';
import { getProjectStore } from '@core/features/projects/api/browser/stores/project-selectors';
import { getMementoClient } from '@core/primitives/mementos/browser';
import {
  contributeScopedStore,
  type AppScopedStoreContribution,
} from '@core/primitives/scoped-stores/browser';
import { runTriageOnce } from '../api/browser/messaging-queries';
import { AutoTriageStore } from '../browser/auto-triage-store';
import { autoTriageStoreToken } from './app-store-tokens';

// Reads the clients store, so the clients contribution must come first in the app-scope manifest.
export const messagingAppStoreContributions: readonly AppScopedStoreContribution[] = [
  contributeScopedStore({
    token: autoTriageStoreToken,
    create: (_context, stores) =>
      new AutoTriageStore({
        memento: getMementoClient,
        matches: () => stores.get(clientsStoreToken).matches,
        projectPath: (projectId) => {
          const project = getProjectStore(projectId);
          return project?.state === 'registered' && project.data?.type === 'local'
            ? project.data.path
            : undefined;
        },
        runTriage: runTriageOnce,
      }),
    activate: (store) => store.start(),
    dispose: (store) => store.dispose(),
  }),
];
