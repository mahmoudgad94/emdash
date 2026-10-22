import { Button, toast } from '@emdash/ui/react/primitives';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import {
  clientWorkQueryOptions,
  clientsQueryOptions,
} from '@core/features/clients/api/browser/clients-queries';
import { clientsStoreToken } from '@core/features/clients/contributions/app-store-tokens';
import { taskViewDef } from '@core/features/tasks/contributions/views';
import { useOpenModal } from '@core/manifests/browser/modal-api';
import { getMementoClient } from '@core/primitives/mementos/browser';
import { useMemento } from '@core/primitives/mementos/react';
import { useNavigate } from '@core/primitives/navigation/browser/navigation-hooks';
import { getAppStores } from '@core/primitives/scoped-stores/browser';
import {
  conversationMessagesQueryOptions,
  needYouQueryOptions,
} from '../api/browser/messaging-queries';
import type { ConversationSummary } from '../api/schemas';
import { buildTriageContext } from '../api/triage-context';
import { pickTriageProject } from '../api/triage-project';
import { buildTriagePrompt, triageTaskName } from '../api/triage-prompt';
import { threadLinkMemento } from '../contributions/mementos';
import { recordTriageStart } from './triage-start';

/**
 * Starts a Claude Code task in the client's own project that reads this conversation, works out
 * what kind of message it is, what must come first and which checkout it concerns, and drafts a
 * reply. It opens the normal Create Task dialog with the prompt filled in, so nothing runs until
 * the owner confirms, and nothing is sent to the client.
 */
export function AskClaudeButton({ conversation }: { conversation: ConversationSummary }) {
  const openCreateTask = useOpenModal('taskModal');
  const { navigate } = useNavigate();
  const [link] = useMemento(threadLinkMemento);
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
    const context = buildTriageContext({
      client,
      conversation,
      messages: thread.data.messages,
      work: work.data,
      drafts: needYou.data?.drafts ?? [],
    });
    void openCreateTask({
      projectId,
      initialPrompt: buildTriagePrompt(context),
      initialTaskName: triageTaskName(context),
      useRepoRoot: true,
      onTaskCreated: ({ projectId: createdIn, taskId }) =>
        void recordTriageStart(getMementoClient(), {
          conversationId: conversation.id,
          clientId: client.id,
          projectId: createdIn,
          taskId,
        }),
    });
  };

  const linked = link.projectId !== null && link.taskId !== null;
  return (
    <div className="flex items-center gap-1.5">
      {linked && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            navigate(taskViewDef({ projectId: link.projectId!, taskId: link.taskId! }))
          }
          title="Continue in the task that was started for this conversation."
        >
          Open task
        </Button>
      )}
      <Button
        variant={linked ? 'ghost' : 'secondary'}
        size="sm"
        disabled={!client || !thread.data}
        onClick={ask}
        title="Claude reads this conversation, finds the project and drafts a reply. Nothing is sent."
      >
        <Sparkles className="size-3.5" />
        {linked ? 'Ask again' : 'Ask Claude'}
      </Button>
    </div>
  );
}
