import { defineVersionedSchema } from '@emdash/core/primitives/versioned-schema/api';
import { z } from 'zod';
import { days, defineMemento } from '@core/primitives/mementos/api';
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
