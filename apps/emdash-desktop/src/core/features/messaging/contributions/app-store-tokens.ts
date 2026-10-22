import { scopedStoreToken } from '@core/primitives/scoped-stores/browser';
import type { AutoTriageStore } from '../browser/auto-triage-store';

export const autoTriageStoreToken = scopedStoreToken<AutoTriageStore>('messaging.auto-triage');
