import { scopedStoreToken } from '@core/primitives/scoped-stores/browser';
import type { TriageResultsStore } from '../browser/triage-results-store';

export const triageResultsStoreToken = scopedStoreToken<TriageResultsStore>(
  'messaging.triage-results'
);
