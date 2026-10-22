import { z } from 'zod';
import { workbenchLayout } from '@core/primitives/layouts/api';
import { defineView } from '@core/primitives/views/api';

export const todayViewDef = defineView({
  id: 'today',
  params: z.object({}),
  layout: workbenchLayout,
  telemetryEvent: 'today_viewed',
});
