import type { QueryObserverOptions } from '@tanstack/react-query';
import { CLIENT_OPS_QUERY_ROOT } from '@core/features/clientops-core/api';
import type {
  ConversationList,
  ConversationThread,
  CreateDraftInput,
  Draft,
  NeedYou,
} from '../schemas';
import { getMessagingClient } from './client';

const ROOT = [...CLIENT_OPS_QUERY_ROOT, 'messaging'] as const;

export const conversationsQueryKey = [...ROOT, 'conversations'] as const;
export const conversationMessagesQueryKey = (id: string) => [...ROOT, 'messages', id] as const;
export const needYouQueryKey = [...ROOT, 'need-you'] as const;

const CONVERSATIONS_REFRESH_MS = 30_000;
const MESSAGES_REFRESH_MS = 15_000;
const NEED_YOU_REFRESH_MS = 30_000;
// Messages are read live from Core and never stored by the app, so the copy goes soon after the
// conversation is closed.
const MESSAGES_GC_MS = 60_000;

/** A Core refusal or connection fault, kept with its code so callers can tell them apart. */
export class MessagingQueryError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'MessagingQueryError';
  }
}

export async function fetchConversations(): Promise<ConversationList> {
  const result = await (await getMessagingClient()).conversations({});
  if (!result.success) throw new MessagingQueryError(result.error.code, result.error.message);
  return result.data;
}

export async function fetchConversationMessages(id: string): Promise<ConversationThread> {
  const result = await (await getMessagingClient()).conversation({ id });
  if (!result.success) throw new MessagingQueryError(result.error.code, result.error.message);
  return result.data;
}

export async function fetchNeedYou(): Promise<NeedYou> {
  const result = await (await getMessagingClient()).needYou(undefined);
  if (!result.success) throw new MessagingQueryError(result.error.code, result.error.message);
  return result.data;
}

/** Saves a reply as a Core draft; nothing is sent. */
export async function saveDraft(input: CreateDraftInput): Promise<Draft> {
  const result = await (await getMessagingClient()).createDraft(input);
  if (!result.success) throw new MessagingQueryError(result.error.code, result.error.message);
  return result.data;
}

/** Opens the Client Ops Mac app, where a draft is approved with Touch ID. */
export async function openApprovalApp(): Promise<void> {
  const result = await (await getMessagingClient()).openApprovalApp(undefined);
  if (!result.success) throw new MessagingQueryError(result.error.code, result.error.message);
}

const stopsOnDenial = (query: { state: { error: MessagingQueryError | null } }) =>
  query.state.error?.code === 'policy_denied';

/** Conversations across every client; polling stops if Core refuses it to this identity. */
export function conversationsQueryOptions(
  fetcher: () => Promise<ConversationList> = fetchConversations
): QueryObserverOptions<ConversationList, MessagingQueryError> {
  return {
    queryKey: conversationsQueryKey,
    queryFn: fetcher,
    staleTime: CONVERSATIONS_REFRESH_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (stopsOnDenial(query) ? false : CONVERSATIONS_REFRESH_MS),
  };
}

/** The open conversation's messages, refreshed every 15 seconds while the conversation is open. */
export function conversationMessagesQueryOptions(
  id: string,
  fetcher: (id: string) => Promise<ConversationThread> = fetchConversationMessages
): QueryObserverOptions<ConversationThread, MessagingQueryError> {
  return {
    queryKey: conversationMessagesQueryKey(id),
    queryFn: () => fetcher(id),
    staleTime: MESSAGES_REFRESH_MS,
    gcTime: MESSAGES_GC_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const code = query.state.error?.code;
      return code === 'policy_denied' || code === 'not_found' ? false : MESSAGES_REFRESH_MS;
    },
  };
}

/**
 * Drafts waiting for the owner. Core lists them only to owner devices today, so a `policy_denied`
 * answer stops the polling and the panel says so instead of retrying.
 */
export function needYouQueryOptions(
  fetcher: () => Promise<NeedYou> = fetchNeedYou
): QueryObserverOptions<NeedYou, MessagingQueryError> {
  return {
    queryKey: needYouQueryKey,
    queryFn: fetcher,
    staleTime: NEED_YOU_REFRESH_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (stopsOnDenial(query) ? false : NEED_YOU_REFRESH_MS),
  };
}
