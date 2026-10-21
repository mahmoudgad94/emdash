import type { QueryObserverOptions } from '@tanstack/react-query';
import { CLIENT_OPS_QUERY_ROOT } from '@core/features/clientops-core/api';
import type { ClientActivity, ClientsList, ClientWork, RepoInspectionList } from '../schemas';
import { getClientsClient } from './client';

export const clientsQueryKey = [...CLIENT_OPS_QUERY_ROOT, 'clients'] as const;
export const clientActivityQueryKey = [...CLIENT_OPS_QUERY_ROOT, 'activity'] as const;

export const clientWorkQueryKey = (clientId: string) =>
  [...CLIENT_OPS_QUERY_ROOT, 'client-work', clientId] as const;
export const repoInspectionQueryKey = (repos: readonly string[]) =>
  [...CLIENT_OPS_QUERY_ROOT, 'repo-inspection', ...repos] as const;

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

const WORK_REFRESH_MS = 300_000;

export async function fetchClientWork(clientId: string): Promise<ClientWork> {
  const result = await (await getClientsClient()).work({ clientId });
  if (!result.success) throw new ClientsQueryError(result.error.code, result.error.message);
  return result.data;
}

export async function fetchRepoInspection(repos: readonly string[]): Promise<RepoInspectionList> {
  const result = await (await getClientsClient()).inspectRepos({ repos: [...repos] });
  if (!result.success) throw new ClientsQueryError(result.error.code, result.error.message);
  return result.data;
}

/** The dashboard's contracts and payments for one client. */
export function clientWorkQueryOptions(
  clientId: string
): QueryObserverOptions<ClientWork, ClientsQueryError> {
  return {
    queryKey: clientWorkQueryKey(clientId),
    queryFn: () => fetchClientWork(clientId),
    staleTime: WORK_REFRESH_MS / 2,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: WORK_REFRESH_MS,
  };
}

/** Which of a client's registered repositories exist on this machine. */
export function repoInspectionQueryOptions(
  repos: readonly string[]
): QueryObserverOptions<RepoInspectionList, ClientsQueryError> {
  return {
    queryKey: repoInspectionQueryKey(repos),
    queryFn: () => fetchRepoInspection(repos),
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
  };
}
