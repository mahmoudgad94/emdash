import { fetchClientWork, fetchClients } from '@core/features/clients/api/browser/clients-queries';
import type { ProjectMatch } from '@core/features/clients/api/match-projects';
import type { ClientsList } from '@core/features/clients/api/schemas';
import { log } from '@core/primitives/logging/browser/logger';
import type { MementoClient } from '@core/primitives/mementos/browser';
import { appSubject } from '@core/primitives/subjects/api';
import {
  canStartAutoTriage,
  eligibleForAutoTriage,
  recordAutoTriage,
  rollDay,
  withBaseline,
  type AutoTriageState,
} from '../api/auto-triage';
import {
  fetchConversationMessages,
  fetchConversations,
  fetchNeedYou,
} from '../api/browser/messaging-queries';
import { buildTriageContext } from '../api/triage-context';
import { pickTriageProject } from '../api/triage-project';
import { buildTriagePrompt, triageTaskName } from '../api/triage-prompt';
import { autoTriageMemento, threadLinkMemento } from '../contributions/mementos';
import { clientThreadSubject } from '../contributions/subject';

const TICK_MS = 60_000;
const FIRST_TICK_MS = 20_000;

export type AutoTriageDeps = {
  memento: () => MementoClient;
  /** Open Emdash projects matched to a client, from the Clients store. */
  matches: () => ReadonlyMap<string, ProjectMatch>;
  startTask: (params: {
    projectId: string;
    name: string;
    prompt: string;
  }) => Promise<string | undefined>;
  now?: () => Date;
};

const dayOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Starts a Claude Code triage task by itself when a new client message needs the owner and the
 * client has an open project: it reads the conversation, checks the project and drafts a reply.
 * At most one task per minute, a small daily limit, only for messages that arrive after it was
 * first switched on, and every started task is linked to its conversation so work continues there.
 * It runs while the app is open and never sends anything to a client.
 */
export class AutoTriageStore {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private stopped = false;

  constructor(private readonly deps: AutoTriageDeps) {}

  start(): void {
    this.stopped = false;
    this.schedule(FIRST_TICK_MS);
  }

  dispose(): void {
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.run();
    } catch (error) {
      log.warn('auto-triage skipped a round', error);
    } finally {
      this.running = false;
      this.schedule(TICK_MS);
    }
  }

  private async run(): Promise<void> {
    const mementos = this.deps.memento();
    const appSpace = mementos.subject(appSubject({}));
    await appSpace.ready;
    try {
      const handle = appSpace.handle(autoTriageMemento);
      const today = dayOf((this.deps.now ?? (() => new Date()))());
      let state: AutoTriageState = rollDay(handle.value, today);
      if (!state.enabled) return;

      const conversations = (await fetchConversations()).conversations;
      state = withBaseline(state, conversations);
      if (state !== handle.value) handle.update(state);
      if (!canStartAutoTriage(state)) return;

      const drafts = (await fetchNeedYou()).drafts;
      const clients: ClientsList = await fetchClients();
      const matches = this.deps.matches();
      const candidates = eligibleForAutoTriage({
        state,
        conversations,
        drafts,
        projectFor: (conversation) =>
          pickTriageProject(matches, conversation.source.clientId, conversation.source.projectId),
      });

      for (const candidate of candidates) {
        const { conversation, projectId } = candidate;
        const client = clients.clients.find((c) => c.id === conversation.source.clientId);
        if (!client) continue;

        const threadSpace = mementos.subject(
          clientThreadSubject({ conversationId: conversation.id })
        );
        await threadSpace.ready;
        try {
          const link = threadSpace.handle(threadLinkMemento);
          if (link.value.taskId !== null) {
            // Already being worked on: remember this message so it is not triaged again.
            handle.update({
              ...state,
              attempted: { ...state.attempted, [conversation.id]: conversation.lastSeq },
            });
            continue;
          }
          const [thread, work] = await Promise.all([
            fetchConversationMessages(conversation.id),
            fetchClientWork(client.id).catch(() => undefined),
          ]);
          const context = buildTriageContext({
            client,
            conversation,
            messages: thread.messages,
            work,
            drafts,
          });
          const taskId = await this.deps.startTask({
            projectId,
            name: triageTaskName(context),
            prompt: buildTriagePrompt(context),
          });
          if (taskId === undefined) continue;
          link.update({
            version: '1',
            projectId,
            taskId,
            linkedAt: new Date().toISOString(),
          });
          handle.update(recordAutoTriage(state, conversation.id, conversation.lastSeq));
          return;
        } finally {
          await threadSpace.release();
        }
      }
    } finally {
      await appSpace.release();
    }
  }
}
