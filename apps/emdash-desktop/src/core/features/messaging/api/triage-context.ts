import { formatMinor } from '@core/features/clients/api/money';
import type { Client, ClientWork } from '@core/features/clients/api/schemas';
import { channelLabel, UNRECOGNIZED_SENDER } from './labels';
import type { ConversationSummary, Draft, ThreadMessage } from './schemas';
import { draftsForChannel } from './thread';
import { orderRepos } from './triage-project';
import type { TriageContext } from './triage-prompt';

/**
 * Everything a triage needs to know, gathered from what the app already read: the client, its
 * project and checkouts, what the dashboard holds, drafts already waiting and the conversation
 * without the strangers Core holds back.
 */
export function buildTriageContext(input: {
  client: Client;
  conversation: ConversationSummary;
  messages: readonly ThreadMessage[];
  work: ClientWork | undefined;
  drafts: readonly Draft[];
}): TriageContext {
  const { client, conversation, work } = input;
  const clientProject = client.projects.find((p) => p.id === conversation.source.projectId);
  const business = work?.linked
    ? [
        ...work.contracts.map((c) => `Contract: ${c.label}${c.state ? ` (${c.state})` : ''}`),
        `${work.payments.count} payments, ${formatMinor(work.payments.totalMinor, work.payments.currency)}`,
      ]
    : [];
  return {
    clientName: client.name,
    agreement: client.agreement,
    contacts: client.people.map((p) => p.name),
    channel: channelLabel(conversation).split(' · ')[0] ?? conversation.provider,
    projectName: clientProject?.name ?? conversation.source.projectName,
    repos: orderRepos(clientProject?.repos ?? client.projects.flatMap((p) => p.repos)),
    messages: input.messages
      .filter((m) => m.heldReason === null || m.sender !== UNRECOGNIZED_SENDER)
      .map((m) => ({ sender: m.sender, at: m.at, text: m.text })),
    business,
    pendingDrafts: draftsForChannel(input.drafts, {
      provider: conversation.provider,
      account: conversation.source.account,
      channel: conversation.source.channel,
    }).map((d) => d.text),
  };
}
