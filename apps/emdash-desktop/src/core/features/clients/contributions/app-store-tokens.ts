import { scopedStoreToken } from '@core/primitives/scoped-stores/browser';
import type { ClientsStore } from '../browser/clients-store';

/**
 * App-scope token for the ClientsStore. Kept in a token-only module so the workbench sidebar can
 * resolve the store through the scoped-store lookup without a runtime dependency on its code.
 */
export const clientsStoreToken = scopedStoreToken<ClientsStore>('clients.store');
