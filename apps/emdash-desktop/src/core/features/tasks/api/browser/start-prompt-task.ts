import { nextDefaultConversationTitle } from '@core/features/conversations/api/browser/conversation-title-utils';
import { getProjectStore } from '@core/features/projects/api/browser/stores/project-selectors';
import { getTaskManagerStore } from '@core/features/tasks/api/browser/task-state/task-selectors';
import { log } from '@core/primitives/logging/browser/logger';
import { buildWorkspaceConfigFromPreset } from '@core/primitives/workspaces/api';

/**
 * Starts a Claude Code task in the project's own checkout (no new branch or worktree) that opens
 * with the given prompt, and returns its id. Nothing is shown to the user. Returns undefined when
 * the project is not ready, so the caller can try again later.
 */
export async function startPromptTask(params: {
  projectId: string;
  name: string;
  prompt: string;
}): Promise<string | undefined> {
  const project = getProjectStore(params.projectId);
  const repositoryWorkspaceId =
    project?.state === 'registered' ? (project.data?.repositoryWorkspaceId ?? null) : null;
  const taskManager = getTaskManagerStore(params.projectId);
  if (!repositoryWorkspaceId || !taskManager) return undefined;

  const id = crypto.randomUUID();
  try {
    await taskManager.createTask({
      id,
      projectId: params.projectId,
      taskConfig: {
        version: '1',
        name: params.name,
        initialConversation: {
          id: crypto.randomUUID(),
          provider: 'claude',
          title: nextDefaultConversationTitle('claude', []),
          type: 'pty',
          initialPrompt: params.prompt,
          autoApprove: false,
        },
      },
      workspaceConfig: buildWorkspaceConfigFromPreset('repo-root', { repositoryWorkspaceId }),
    });
    return id;
  } catch (error) {
    log.error('could not start the task', error);
    return undefined;
  }
}
