import { z } from 'zod';
import { workbenchLayout } from '@core/primitives/layouts/api';
import { defineView } from '@core/primitives/views/api';

export const clientsViewDef = defineView({
  id: 'clients',
  params: z.object({
    /** The selected client; absent selects `scope`, or the first client with sessions. */
    clientId: z.string().optional(),
    scope: z.enum(['own', 'unmatched']).optional(),
    /** The session whose conversation is open in the read-only panel. */
    sessionId: z.string().optional(),
  }),
  layout: workbenchLayout,
  telemetryEvent: 'clients_viewed',
});
