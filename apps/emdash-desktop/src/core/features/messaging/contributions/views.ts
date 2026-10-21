import { z } from 'zod';
import { workbenchLayout } from '@core/primitives/layouts/api';
import { defineView } from '@core/primitives/views/api';

export const messagesViewDef = defineView({
  id: 'messages',
  params: z.object({
    /** The conversation whose messages are open; absent selects the most recent one. */
    conversationId: z.string().optional(),
    /** Opens the panel with the drafts waiting for approval. */
    needYou: z.boolean().optional(),
  }),
  layout: workbenchLayout,
  telemetryEvent: 'messages_viewed',
});
