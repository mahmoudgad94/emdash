import {
  fetchSessionList,
  fetchSessionTranscript,
} from '@core/features/observed-sessions/api/browser/observed-sessions-queries';
import { log } from '@core/primitives/logging/browser/logger';
import type { MementoClient } from '@core/primitives/mementos/browser';
import { appSubject } from '@core/primitives/subjects/api';
import type { TriageResult } from '../api/triage-prompt';
import { readTriage, TRIAGE_GIVE_UP_MS } from '../api/triage-result';
import { autoTriageMemento, threadTriageMemento } from '../contributions/mementos';
import { clientThreadSubject } from '../contributions/subject';

const TICK_MS = 60_000;
const FIRST_TICK_MS = 20_000;
const MAX_PENDING_PER_TICK = 3;
const MAX_SESSIONS_PER_PENDING = 4;
/** A session may start a little before the task was recorded. */
const START_SLACK_MS = 120_000;

export type TriageResultsDeps = {
  memento: () => MementoClient;
  now?: () => Date;
};

/**
 * Reads back the answers of triage tasks started with Ask Claude: it finds each task's Claude
 * session through Core by the marker its prompt opens with, and keeps Claude's read on the
 * conversation. Replies to new client messages are drafted by Client Ops Core itself, all the
 * time, so this app does not draft in the background.
 */
export class TriageResultsStore {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private stopped = false;

  constructor(private readonly deps: TriageResultsDeps) {}

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
    } catch (error) {
      log.warn('triage results skipped a round', error);
    } finally {
      this.running = false;
      this.schedule(TICK_MS);
    }
  }

  private async readResults(): Promise<void> {
    const mementos = this.deps.memento();
    const app = mementos.subject(appSubject({}));
    await app.ready;
    try {
      const handle = app.handle(autoTriageMemento);
      const pending = Object.entries(handle.value.pending ?? {}).slice(0, MAX_PENDING_PER_TICK);
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
          const rest = { ...(current.pending ?? {}) };
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
}
