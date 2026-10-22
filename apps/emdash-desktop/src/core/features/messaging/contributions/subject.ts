import { z } from 'zod';
import { defineSubject } from '@core/primitives/subjects/api';

/** One client conversation as Core numbers it; what the owner has set up around it hangs here. */
export const clientThreadSubject = defineSubject({
  kind: 'client-thread',
  key: z.object({ conversationId: z.string().min(1) }),
  encode: ({ conversationId }) => conversationId,
});
