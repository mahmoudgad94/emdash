import { Button, toast } from '@emdash/ui/react/primitives';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import {
  clientWorkQueryOptions,
  clientsQueryOptions,
} from '@core/features/clients/api/browser/clients-queries';
import { formatMinor } from '@core/features/clients/api/money';
import { clientsStoreToken } from '@core/features/clients/contributions/app-store-tokens';
import { useOpenModal } from '@core/manifests/browser/modal-api';
import { getAppStores } from '@core/primitives/scoped-stores/browser';
import {
  conversationMessagesQueryOptions,
  needYouQueryOptions,
} from '../api/browser/messaging-queries';
import { channelLabel, UNRECOGNIZED_SENDER } from '../api/labels';
import type { ConversationSummary } from '../api/schemas';
import { draftsForChannel } from '../api/thread';
import { orderRepos, pickTriageProject } from '../api/triage-project';
import { buildTriagePrompt, triageTaskName } from '../api/triage-prompt';

/**
 * Starts a Claude Code task in the client's own project that reads this conversation, works out
 * what kind of message it is, what must come first and which checkout it concerns, and drafts a
 * reply. It opens the normal Create Task dialog with the prompt filled in, so nothing runs until
 * the owner confirms, and nothing is sent to the client.
 */
export function AskClaudeButton({ conversation }: { conversation: ConversationSummary }) {
  const openCreateTask = useOpenModal('taskModal');
  const clientsQuery = useQuery(clientsQueryOptions());
  const thread = useQuery(conversationMessagesQueryOptions(conversation.id));
  const needYou = useQuery(needYouQueryOptions());
  const client = clientsQuery.data?.clients.find((c) => c.id === conversation.source.clientId);
  const work = useQuery({
    ...clientWorkQueryOptions(conversation.source.clientId),
    enabled: client !== undefined,
  });

  const ask = () => {
    if (!client || !thread.data) return;
    const projectId = pickTriageProject(
      getAppStores().get(clientsStoreToken).matches,
      client.id,
      conversation.source.projectId
    );
    if (projectId === undefined) {
      toast.error('No project open for this client yet', {
        description: 'Open one of its repositories from the Clients page first.',
      });
      return;
    }
    const clientProject = client.projects.find((p) => p.id === conversation.source.projectId);
    const messages = thread.data.messages
      .filter((m) => m.heldReason === null || m.sender !== UNRECOGNIZED_SENDER)
      .map((m) => ({ sender: m.sender, at: m.at, text: m.text }));
    const data = work.data;
    const business = data?.linked
      ? [
          ...data.contracts.map((c) => `Contract: ${c.label}${c.state ? ` (${c.state})` : ''}`),
          `${data.payments.count} payments, ${formatMinor(data.payments.totalMinor, data.payments.currency)}`,
        ]
      : [];
    const context = {
      clientName: client.name,
      agreement: client.agreement,
      contacts: client.people.map((p) => p.name),
      channel: channelLabel(conversation).split(' · ')[0] ?? conversation.provider,
      projectName: clientProject?.name ?? conversation.source.projectName,
      repos: orderRepos(clientProject?.repos ?? client.projects.flatMap((p) => p.repos)),
      messages,
      business,
      pendingDrafts: draftsForChannel(needYou.data?.drafts ?? [], {
        provider: conversation.provider,
        account: conversation.source.account,
        channel: conversation.source.channel,
      }).map((d) => d.text),
    };
    void openCreateTask({
      projectId,
      initialPrompt: buildTriagePrompt(context),
      initialTaskName: triageTaskName(context),
      useRepoRoot: true,
    });
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={!client || !thread.data}
      onClick={ask}
      title="Claude reads this conversation, finds the project and drafts a reply. Nothing is sent."
    >
      <Sparkles className="size-3.5" />
      Ask Claude
    </Button>
  );
}
