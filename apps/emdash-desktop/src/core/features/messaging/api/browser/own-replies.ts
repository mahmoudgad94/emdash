import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ConversationSummary } from '../schemas';
import { fetchHistory } from './messaging-queries';

const REFRESH_MS = 30_000;

/**
 * When the owner last wrote in each WhatsApp conversation, read from their own WhatsApp store:
 * conversation id to an instant, null when they never did. Conversations whose history cannot be
 * read are left out, so callers fall back to what Core knows.
 */
export function useOwnLastReplies(
  conversations: readonly ConversationSummary[]
): ReadonlyMap<string, string | null> {
  const whatsapp = useMemo(
    () => conversations.filter((conversation) => conversation.provider === 'whatsapp'),
    [conversations]
  );
  const results = useQueries({
    queries: whatsapp.map((conversation) => ({
      queryKey: [
        'clientops',
        'messaging',
        'history',
        'own-last',
        conversation.source.channel,
      ] as const,
      queryFn: () =>
        fetchHistory({ channel: conversation.source.channel, fromMeOnly: true, limit: 1 }),
      staleTime: REFRESH_MS,
      refetchInterval: REFRESH_MS,
      retry: false,
      refetchOnWindowFocus: false,
    })),
    combine: (all) => all.map((result) => result.data),
  });
  return useMemo(() => {
    const map = new Map<string, string | null>();
    whatsapp.forEach((conversation, index) => {
      const page = results[index];
      if (!page?.available) return;
      map.set(conversation.id, page.messages.at(-1)?.at ?? null);
    });
    return map;
  }, [whatsapp, results]);
}
