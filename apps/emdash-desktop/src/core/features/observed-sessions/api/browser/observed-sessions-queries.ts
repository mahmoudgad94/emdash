import type { QueryObserverOptions } from '@tanstack/react-query';
import { CLIENT_OPS_QUERY_ROOT } from '@core/features/clientops-core/api';
import type { ObservedSessionsList, SessionTranscript, WorkSummary } from '../schemas';
import { scopeKey, scopeListInput, type SessionScope } from '../session-scope';
import { getObservedSessionsClient } from './client';

const ROOT = [...CLIENT_OPS_QUERY_ROOT, 'observed-sessions'] as const;

export const workSummaryQueryKey = [...ROOT, 'summary'] as const;
export const sessionListQueryKey = (scope: SessionScope) =>
  [...ROOT, 'list', scopeKey(scope)] as const;
export const sessionTranscriptQueryKey = (id: string) => [...ROOT, 'transcript', id] as const;

const SUMMARY_REFRESH_MS = 30_000;
const LIST_REFRESH_MS = 30_000;
// A transcript is read live from the machine that ran the session and never stored, so the app
// drops its copy soon after the panel closes.
const TRANSCRIPT_GC_MS = 30_000;

/** A Core refusal or connection fault, kept with its code so callers can tell them apart. */
export class ObservedSessionsQueryError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ObservedSessionsQueryError';
  }
}

export async function fetchWorkSummary(): Promise<WorkSummary> {
  const result = await (await getObservedSessionsClient()).summary(undefined);
  if (!result.success)
    throw new ObservedSessionsQueryError(result.error.code, result.error.message);
  return result.data;
}

export async function fetchSessionList(scope: SessionScope): Promise<ObservedSessionsList> {
  const result = await (await getObservedSessionsClient()).list(scopeListInput(scope));
  if (!result.success)
    throw new ObservedSessionsQueryError(result.error.code, result.error.message);
  return result.data;
}

export async function fetchSessionTranscript(id: string): Promise<SessionTranscript> {
  const result = await (await getObservedSessionsClient()).transcript({ id });
  if (!result.success)
    throw new ObservedSessionsQueryError(result.error.code, result.error.message);
  return result.data;
}

const stopsOnDenial = (query: { state: { error: ObservedSessionsQueryError | null } }) =>
  query.state.error?.code === 'policy_denied';

/** Sessions per client plus those live now; polling stops if Core refuses it to this identity. */
export function workSummaryQueryOptions(
  fetcher: () => Promise<WorkSummary> = fetchWorkSummary
): QueryObserverOptions<WorkSummary, ObservedSessionsQueryError> {
  return {
    queryKey: workSummaryQueryKey,
    queryFn: fetcher,
    staleTime: SUMMARY_REFRESH_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (stopsOnDenial(query) ? false : SUMMARY_REFRESH_MS),
  };
}

export function sessionListQueryOptions(
  scope: SessionScope,
  fetcher: (scope: SessionScope) => Promise<ObservedSessionsList> = fetchSessionList
): QueryObserverOptions<ObservedSessionsList, ObservedSessionsQueryError> {
  return {
    queryKey: sessionListQueryKey(scope),
    queryFn: () => fetcher(scope),
    staleTime: LIST_REFRESH_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (stopsOnDenial(query) ? false : LIST_REFRESH_MS),
  };
}

/** Read on demand when a session is opened; never polled and never retried behind the owner's back. */
export function sessionTranscriptQueryOptions(
  id: string,
  fetcher: (id: string) => Promise<SessionTranscript> = fetchSessionTranscript
): QueryObserverOptions<SessionTranscript, ObservedSessionsQueryError> {
  return {
    queryKey: sessionTranscriptQueryKey(id),
    queryFn: () => fetcher(id),
    staleTime: 0,
    gcTime: TRANSCRIPT_GC_MS,
    retry: false,
    refetchOnWindowFocus: false,
  };
}
