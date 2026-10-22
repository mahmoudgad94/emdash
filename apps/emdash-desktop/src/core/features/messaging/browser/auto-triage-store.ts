import { fetchClientWork, fetchClients } from '@core/features/clients/api/browser/clients-queries';
import type { ProjectMatch } from '@core/features/clients/api/match-projects';
import type { ClientsList } from '@core/features/clients/api/schemas';
import {
  fetchSessionList,
  fetchSessionTranscript,
} from '@core/features/observed-sessions/api/browser/observed-sessions-queries';
import { log } from '@core/primitives/logging/browser/logger';
import type { MementoValue } from '@core/primitives/mementos/api';
import type { MementoClient } from '@core/primitives/mementos/browser';
import { appSubject } from '@core/primitives/subjects/api';
import {
  canStartAutoTriage,
  eligibleForAutoTriage,
  recordAutoTriage,
  rollDay,
  shouldAutoDraft,
  withBaseline,
} from '../api/auto-triage';
import {
  fetchConversationMessages,
  fetchConversations,
  fetchHistory,
  fetchNeedYou,
  saveDraft,
} from '../api/browser/messaging-queries';
import { draftInputFor } from '../api/draft-payload';
import { replyState } from '../api/reply-state';
import type { ConversationSummary } from '../api/schemas';
import { buildTriageContext } from '../api/triage-context';
import { pickTriageProject } from '../api/triage-project';
import { buildTriagePrompt, parseTriageResult, type TriageResult } from '../api/triage-prompt';
import { readTriage, TRIAGE_GIVE_UP_MS } from '../api/triage-result';
import {
  autoTriageMemento,
  threadLinkMemento,
  threadTriageMemento,
} from '../contributions/mementos';
import { clientThreadSubject } from '../contributions/subject';

const TICK_MS = 60_000;
const FIRST_TICK_MS = 20_000;
/** Most pending answers looked at in one round, and sessions read for each. */
const MAX_PENDING_PER_TICK = 3;
const MAX_SESSIONS_PER_PENDING = 4;
/** A session may start a little before the task was recorded. */
const START_SLACK_MS = 120_000;

export type AutoTriageDeps = {
  memento: () => MementoClient;
  /** Open Emdash projects matched to a client, from the Clients store. */
  matches: () => ReadonlyMap<string, ProjectMatch>;
  /** The folder of an open project on this Mac; undefined for remote or missing projects. */
  projectPath: (projectId: string) => string | undefined;
  /** Runs Claude Code once, read-only, in a folder and returns its answer. */
  runTriage: (input: { cwd: string; prompt: string }) => Promise<string>;
  now?: () => Date;
};

const dayOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * When a new client message needs the owner and the client has an open project on this Mac, has
 * Claude Code read the conversation and the project in the background (read-only, no task) and
 * saves its reply as a draft. It also reads back the answers of triage tasks started by hand. At most one task per minute, a small daily limit, only
 * for messages that arrive after it was first switched on, and every task is linked to its
 * conversation so work continues there. It runs while the app is open and never sends anything.
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

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.readResults();
      await this.startNext();
    } catch (error) {
      log.warn('auto-triage skipped a round', error);
    } finally {
      this.running = false;
      this.schedule(TICK_MS);
    }
  }

  /** Reads back the answers of triage tasks that were started, and gives up on stale ones. */
  private async readResults(): Promise<void> {
    const mementos = this.deps.memento();
    const app = mementos.subject(appSubject({}));
    await app.ready;
    try {
      const handle = app.handle(autoTriageMemento);
      const pending = Object.entries(handle.value.pending).slice(0, MAX_PENDING_PER_TICK);
      for (const [conversationId, entry] of pending) {
        const startedMs = Date.parse(entry.startedAt);
        const result = await this.findResult(conversationId, entry.clientId, startedMs);
        const stale = this.now().getTime() - startedMs > TRIAGE_GIVE_UP_MS;
        if (!result && !stale) continue;

        const thread = mementos.subject(clientThreadSubject({ conversationId }));
        await thread.ready;
        try {
          const triage = thread.handle(threadTriageMemento);
          triage.update({
            version: '1',
            status: result ? 'ready' : 'failed',
            startedAt: entry.startedAt,
            result: result ?? null,
          });
          await triage.flush();
        } finally {
          await thread.release();
        }
        handle.update((current) => {
          const rest = { ...current.pending };
          delete rest[conversationId];
          return { ...current, pending: rest };
        });
      }
    } finally {
      await app.release();
    }
  }

  private async findResult(
    conversationId: string,
    clientId: string,
    startedMs: number
  ): Promise<TriageResult | undefined> {
    const sessions = (await fetchSessionList({ kind: 'client', clientId })).items
      .filter(
        (session) =>
          session.source === 'claude' && Date.parse(session.startedAt) >= startedMs - START_SLACK_MS
      )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, MAX_SESSIONS_PER_PENDING);
    for (const session of sessions) {
      const transcript = await fetchSessionTranscript(session.id);
      const read = readTriage(conversationId, transcript.entries);
      if (read.found) return read.result;
    }
    return undefined;
  }

  /**
   * Has Claude read the conversation and the project in the background, with no task, and keeps
   * its answer on the conversation. When drafting is on, the reply is saved as a draft right away;
   * sending it still needs the owner's Touch ID.
   */
  private async draftReply(
    mementos: MementoClient,
    conversation: ConversationSummary,
    cwd: string,
    prompt: string,
    autoDraft: boolean
  ): Promise<void> {
    const startedAt = new Date().toISOString();
    const setTriage = async (value: MementoValue<typeof threadTriageMemento>) => {
      const thread = mementos.subject(clientThreadSubject({ conversationId: conversation.id }));
      await thread.ready;
      try {
        const triage = thread.handle(threadTriageMemento);
        triage.update(value);
        await triage.flush();
      } finally {
        await thread.release();
      }
    };
    await setTriage({ version: '1', status: 'waiting', startedAt, result: null });
    let result: TriageResult | undefined;
    try {
      result = parseTriageResult(await this.deps.runTriage({ cwd, prompt }));
    } catch (error) {
      log.warn('background triage did not finish', error);
    }
    if (!result) {
      await setTriage({ version: '1', status: 'failed', startedAt, result: null });
      return;
    }
    const input =
      autoDraft && shouldAutoDraft(result)
        ? draftInputFor(conversation, result.draft, true)
        : undefined;
    let drafted = false;
    if (input) {
      try {
        await saveDraft(input);
        drafted = true;
      } catch (error) {
        log.warn('could not save the drafted reply', error);
      }
    }
    await setTriage({ version: '1', status: drafted ? 'drafted' : 'ready', startedAt, result });
  }

  /** The owner already answered the client's last message from their phone. */
  private async ownerAnsweredSince(conversation: ConversationSummary): Promise<boolean> {
    if (conversation.provider !== 'whatsapp') return false;
    try {
      const page = await fetchHistory({
        channel: conversation.source.channel,
        fromMeOnly: true,
        limit: 1,
      });
      if (!page.available) return false;
      return replyState(conversation, page.messages.at(-1)?.at ?? null).kind === 'replied';
    } catch {
      return false;
    }
  }

  /** Starts a triage task for the longest-waiting new message, when one is due. */
  private async startNext(): Promise<void> {
    const mementos = this.deps.memento();
    const app = mementos.subject(appSubject({}));
    await app.ready;
    try {
      const handle = app.handle(autoTriageMemento);
      const today = dayOf(this.now());
      handle.update((current) => rollDay(current, today));
      if (!handle.value.enabled) return;

      const conversations = (await fetchConversations()).conversations;
      handle.update((current) => withBaseline(current, conversations));
      if (!canStartAutoTriage(handle.value)) return;

      const drafts = (await fetchNeedYou()).drafts;
      const clients: ClientsList = await fetchClients();
      const matches = this.deps.matches();
      const candidates = eligibleForAutoTriage({
        state: handle.value,
        conversations,
        drafts,
        projectFor: (conversation) =>
          pickTriageProject(matches, conversation.source.clientId, conversation.source.projectId),
      });

      for (const { conversation, projectId } of candidates) {
        if (await this.ownerAnsweredSince(conversation)) {
          handle.update((current) => ({
            ...current,
            attempted: { ...current.attempted, [conversation.id]: conversation.lastSeq },
          }));
          continue;
        }
        const client = clients.clients.find((c) => c.id === conversation.source.clientId);
        if (!client) continue;

        const thread = mementos.subject(clientThreadSubject({ conversationId: conversation.id }));
        await thread.ready;
        let alreadyLinked: boolean;
        try {
          alreadyLinked = thread.handle(threadLinkMemento).value.taskId !== null;
        } finally {
          await thread.release();
        }
        if (alreadyLinked) {
          // Already being worked on: remember this message so it is not triaged again.
          handle.update((current) => ({
            ...current,
            attempted: { ...current.attempted, [conversation.id]: conversation.lastSeq },
          }));
          continue;
        }

        const [messages, work] = await Promise.all([
          fetchConversationMessages(conversation.id),
          fetchClientWork(client.id).catch(() => undefined),
        ]);
        const context = buildTriageContext({
          client,
          conversation,
          messages: messages.messages,
          work,
          drafts,
        });
        const cwd = this.deps.projectPath(projectId);
        if (cwd === undefined) continue;
        handle.update((current) =>
          recordAutoTriage(current, conversation.id, conversation.lastSeq)
        );
        await this.draftReply(
          mementos,
          conversation,
          cwd,
          buildTriagePrompt(context),
          handle.value.autoDraft
        );
        return;
      }
    } finally {
      await app.release();
    }
  }
}
