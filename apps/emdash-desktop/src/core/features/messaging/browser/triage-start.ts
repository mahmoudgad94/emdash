import type { MementoClient } from '@core/primitives/mementos/browser';
import { appSubject } from '@core/primitives/subjects/api';
import {
  autoTriageMemento,
  threadLinkMemento,
  threadTriageMemento,
} from '../contributions/mementos';
import { clientThreadSubject } from '../contributions/subject';

/**
 * Remembers that a triage task was started for a conversation: links the conversation to the task so
 * work continues there, marks the triage as waiting, and queues it for its answer to be read back.
 */
export async function recordTriageStart(
  mementos: MementoClient,
  started: { conversationId: string; clientId: string; projectId: string; taskId: string }
): Promise<void> {
  const now = new Date().toISOString();
  const thread = mementos.subject(clientThreadSubject({ conversationId: started.conversationId }));
  const app = mementos.subject(appSubject({}));
  try {
    await Promise.all([thread.ready, app.ready]);
    thread.handle(threadLinkMemento).update({
      version: '1',
      projectId: started.projectId,
      taskId: started.taskId,
      linkedAt: now,
    });
    thread
      .handle(threadTriageMemento)
      .update({ version: '1', status: 'waiting', startedAt: now, result: null });
    app.handle(autoTriageMemento).update((current) => ({
      ...current,
      pending: {
        ...current.pending,
        [started.conversationId]: {
          startedAt: now,
          clientId: started.clientId,
          projectId: started.projectId,
        },
      },
    }));
    await Promise.all([
      thread.handle(threadLinkMemento).flush(),
      app.handle(autoTriageMemento).flush(),
    ]);
  } finally {
    await Promise.all([thread.release(), app.release()]);
  }
}
