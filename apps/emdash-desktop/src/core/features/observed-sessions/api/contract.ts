import { defineContract, fallible } from '@emdash/wire/rpc';
import { z } from 'zod';
import {
  observedSessionsErrorSchema,
  observedSessionsListSchema,
  sessionListInputSchema,
  sessionTranscriptSchema,
  transcriptInputSchema,
  workSummarySchema,
} from './schemas';

export const observedSessionsDomain = 'observedSessions' as const;

export const observedSessionsContract = defineContract({
  summary: fallible({
    input: z.void(),
    data: workSummarySchema,
    error: observedSessionsErrorSchema,
  }),
  list: fallible({
    input: sessionListInputSchema,
    data: observedSessionsListSchema,
    error: observedSessionsErrorSchema,
  }),
  transcript: fallible({
    input: transcriptInputSchema,
    data: sessionTranscriptSchema,
    error: observedSessionsErrorSchema,
  }),
});

export type ObservedSessionsContract = typeof observedSessionsContract;
