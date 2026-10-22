import type { Client } from '@core/features/clients/api/schemas';
import type { ConversationSummary, HistoryMessage } from './schemas';

const LOCAL_PREFIX = 'local:';

/** A client chat Core has no messages for yet, shown from the owner's WhatsApp history alone. */
export function isLocalConversation(id: string): boolean {
  return id.startsWith(LOCAL_PREFIX);
}

/** The WhatsApp chats registered for active clients, as `[clientId, channel]` pairs. */
export function clientWhatsAppChannels(clients: readonly Client[]) {
  return clients.flatMap((client) =>
    client.status === 'active'
      ? client.channels
          .filter((channel) => channel.provider === 'whatsapp')
          .map((channel) => ({ client, channel }))
      : []
  );
}

/**
 * Every registered WhatsApp chat of an active client that Core has not captured a message for,
 * as a conversation the list can show. Its last message comes from the owner's WhatsApp history,
 * when that is readable.
 */
export function localClientConversations(
  clients: readonly Client[],
  captured: readonly ConversationSummary[],
  lastByChannel: ReadonlyMap<string, HistoryMessage>,
  connectorState: string | null
): ConversationSummary[] {
  const seen = new Set(captured.map((conversation) => conversation.source.channelId));
  return clientWhatsAppChannels(clients)
    .filter(({ channel }) => !seen.has(channel.id))
    .map(({ client, channel }) => {
      const last = lastByChannel.get(channel.channel);
      const project = client.projects.find((p) => p.id === channel.projectId);
      return {
        id: `${LOCAL_PREFIX}${channel.id}`,
        provider: 'whatsapp',
        lastSeq: 0,
        lastMessage: last
          ? {
              text: last.text,
              at: last.at,
              sender: last.sender,
              senderRef: last.fromMe ? 'me' : last.sender,
            }
          : null,
        messageCount: 0,
        untriagedCount: 0,
        heldCount: 0,
        source: {
          clientId: client.id,
          clientName: client.name,
          projectId: channel.projectId,
          projectName: project?.name ?? client.name,
          channelId: channel.id,
          channel: channel.channel,
          account: channel.account,
          context: channel.context,
        },
        connector: { state: connectorState, lastEventAt: null },
      };
    });
}
