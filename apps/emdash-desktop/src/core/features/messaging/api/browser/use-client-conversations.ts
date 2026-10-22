import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { clientsQueryOptions } from '@core/features/clients/api/browser/clients-queries';
import { clientWhatsAppChannels, localClientConversations } from '../client-chats';
import type { ConversationList, ConversationSummary, HistoryMessage } from '../schemas';
import {
  connectorsQueryOptions,
  conversationsQueryOptions,
  fetchHistory,
  type MessagingQueryError,
} from './messaging-queries';

/**
 * Every client conversation the app shows: what Core captured, plus each active client's WhatsApp
 * chat Core has nothing for yet, with its last message from the owner's WhatsApp history.
 * Undefined until Core has answered. The Messages view and Today read the same list.
 */
export function useClientConversations(): {
  conversations: ConversationSummary[] | undefined;
  query: UseQueryResult<ConversationList, MessagingQueryError>;
} {
  const conversationsQuery = useQuery(conversationsQueryOptions());
  const clientsQuery = useQuery(clientsQueryOptions());
  const connectorsQuery = useQuery(connectorsQueryOptions());
  const clientChannels = useMemo(
    () => clientWhatsAppChannels(clientsQuery.data?.clients ?? []),
    [clientsQuery.data]
  );
  const lastMessages = useQueries({
    queries: clientChannels.map(({ channel }) => ({
      queryKey: ['clientops', 'messaging', 'history', 'last', channel.channel] as const,
      queryFn: () => fetchHistory({ channel: channel.channel, limit: 1 }),
      staleTime: 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    })),
    combine: (results) => results.map((result) => result.data?.messages.at(-1)),
  });
  const lastByChannel = useMemo(() => {
    const map = new Map<string, HistoryMessage>();
    clientChannels.forEach(({ channel }, index) => {
      const last = lastMessages[index];
      if (last) map.set(channel.channel, last);
    });
    return map;
  }, [clientChannels, lastMessages]);
  const captured = conversationsQuery.data?.conversations;
  const whatsappState =
    connectorsQuery.data?.connectors.find((c) => c.provider === 'whatsapp')?.state ?? null;
  const conversations = useMemo(
    () =>
      captured === undefined
        ? undefined
        : [
            ...captured,
            ...localClientConversations(
              clientsQuery.data?.clients ?? [],
              captured,
              lastByChannel,
              whatsappState
            ),
          ],
    [captured, clientsQuery.data, lastByChannel, whatsappState]
  );
  return { conversations, query: conversationsQuery };
}
