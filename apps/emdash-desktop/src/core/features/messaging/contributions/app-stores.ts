import { getMementoClient } from '@core/primitives/mementos/browser';
import {
  contributeScopedStore,
  type AppScopedStoreContribution,
} from '@core/primitives/scoped-stores/browser';
import { TriageResultsStore } from '../browser/triage-results-store';
import { triageResultsStoreToken } from './app-store-tokens';

export const messagingAppStoreContributions: readonly AppScopedStoreContribution[] = [
  contributeScopedStore({
    token: triageResultsStoreToken,
    create: () => new TriageResultsStore({ memento: getMementoClient }),
    activate: (store) => store.start(),
    dispose: (store) => store.dispose(),
  }),
];
