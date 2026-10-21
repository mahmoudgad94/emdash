import type { QueryObserverOptions } from '@tanstack/react-query';
import { CLIENT_OPS_QUERY_ROOT } from '@core/features/clientops-core/api';
import type { ClientActivity, ClientsList } from '../schemas';
import { getClientsClient } from './client';

export const clientsQueryKey = [...CLIENT_OPS_QUERY_ROOT, 'clients'] as const;
export const clientActivityQueryKey = [...CLIENT_OPS_QUERY_ROOT, 'activity'] as const;

const CLIENTS_STALE_MS = 60_000;
const CLIENTS_REFRESH_MS = 300_000;
const CLIENTS_RETRY_MS = 60_000;
const ACTIVITY_REFRESH_MS = 30_000;

/** A Core refusal or connection fault, kept with its code so callers can tell them apart. */
export class ClientsQueryError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ClientsQueryError';
  }
}

export async function fetchClients(): Promise<ClientsList> {
  const result = await (await getClientsClient()).list(undefined);
  if (!result.success) throw new ClientsQueryError(result.error.code, result.error.message);
  return result.data;
}

export async function fetchClientActivity(): Promise<ClientActivity> {
  const result = await (await getClientsClient()).activity(undefined);
  if (!result.success) throw new ClientsQueryError(result.error.code, result.error.message);
  return result.data;
}

type Fetcher<T> = () => Promise<T>;

export function clientsQueryOptions(
  fetcher: Fetcher<ClientsList> = fetchClients
): QueryObserverOptions<ClientsList, ClientsQueryError> {
  return {
    queryKey: clientsQueryKey,
    queryFn: fetcher,
    staleTime: CLIENTS_STALE_MS,
    retry: false,
    refetchInterval: (query) =>
      query.state.status === 'error' ? CLIENTS_RETRY_MS : CLIENTS_REFRESH_MS,
  };
}

/**
 * Live sessions per client from Core's `work.summary`. If Core ever refuses it with
 * `policy_denied`, polling stops until the connection changes and the badges stay hidden.
 */
export function clientActivityQueryOptions(
  fetcher: Fetcher<ClientActivity> = fetchClientActivity
): QueryObserverOptions<ClientActivity, ClientsQueryError> {
  return {
    queryKey: clientActivityQueryKey,
    queryFn: fetcher,
    staleTime: ACTIVITY_REFRESH_MS - 5_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      query.state.error?.code === 'policy_denied' ? false : ACTIVITY_REFRESH_MS,
  };
}
