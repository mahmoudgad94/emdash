import { defineVersionedSchema } from '@emdash/core/primitives/versioned-schema/api';
import { z } from 'zod';
import { days, defineMemento } from '@core/primitives/mementos/api';
import { appSubject } from '@core/primitives/subjects/api';
import { clientThreadSubject } from './subject';

const threadLinkV1Schema = z.object({
  version: z.literal('1'),
  /** The project and task a conversation is being worked on in, so work continues in the same place. */
  projectId: z.string().nullable(),
  taskId: z.string().nullable(),
  linkedAt: z.string().nullable(),
});

export const threadLinkSchema = defineVersionedSchema().initial('1', threadLinkV1Schema).build();
export type ThreadLink = typeof threadLinkSchema.Type;

export const threadLinkMemento = defineMemento({
  id: 'messaging.thread-link',
  subject: clientThreadSubject,
  schema: threadLinkSchema,
  default: { version: '1' as const, projectId: null, taskId: null, linkedAt: null },
  retention: { tier: 'persisted', maxAge: days(365), maxEntries: 2_000 },
});

const autoTriageV1Schema = z.object({
  version: z.literal('1'),
  /** Triage tasks started by hand whose answer has not been read back yet, by conversation. */
  pending: z
    .record(
      z.string(),
      z.object({ startedAt: z.string(), clientId: z.string(), projectId: z.string() })
    )
    .default({}),
});

export const autoTriageSchema = defineVersionedSchema().initial('1', autoTriageV1Schema).build();

export const autoTriageMemento = defineMemento({
  id: 'messaging.auto-triage',
  subject: appSubject,
  schema: autoTriageSchema,
  default: { version: '1' as const, pending: {} },
  retention: { tier: 'persisted', maxAge: days(365), maxEntries: 1 },
});

const threadTriageV1Schema = z.object({
  version: z.literal('1'),
  /** `waiting` while Claude works, `ready` when its answer is read back, `used` once acted on. */
  status: z.enum(['none', 'waiting', 'ready', 'used', 'failed']),
  startedAt: z.string().nullable(),
  result: z
    .object({
      type: z.enum([
        'NEW_TASK',
        'REPLY_ONLY',
        'WAITING_ON_CLIENT',
        'QUESTION_FOR_ME',
        'NOTE_TO_REMEMBER',
      ]),
      project: z.string(),
      first: z.string(),
      draft: z.string(),
      next: z.string(),
    })
    .nullable(),
});

export const threadTriageSchema = defineVersionedSchema()
  .initial('1', threadTriageV1Schema)
  .build();

export const threadTriageMemento = defineMemento({
  id: 'messaging.thread-triage',
  subject: clientThreadSubject,
  schema: threadTriageSchema,
  default: { version: '1' as const, status: 'none' as const, startedAt: null, result: null },
  retention: { tier: 'persisted', maxAge: days(180), maxEntries: 2_000 },
});
