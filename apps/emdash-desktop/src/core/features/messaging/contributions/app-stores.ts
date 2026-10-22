import { clientsStoreToken } from '@core/features/clients/contributions/app-store-tokens';
import { startPromptTask } from '@core/features/tasks/api/browser/start-prompt-task';
import { getMementoClient } from '@core/primitives/mementos/browser';
import {
  contributeScopedStore,
  type AppScopedStoreContribution,
} from '@core/primitives/scoped-stores/browser';
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
        startTask: startPromptTask,
      }),
    activate: (store) => store.start(),
    dispose: (store) => store.dispose(),
  }),
];
