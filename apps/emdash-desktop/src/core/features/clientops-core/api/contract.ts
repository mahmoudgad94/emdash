import { defineContract, fallible, procedure } from '@emdash/wire/rpc';
import { z } from 'zod';
import {
  coreLinkOperationErrorSchema,
  coreLinkStatusSchema,
  enrollmentRequestSchema,
} from './schemas';

export const clientOpsCoreDomain = 'clientOpsCore' as const;

export const clientOpsCoreContract = defineContract({
  getStatus: procedure({ input: z.void(), output: coreLinkStatusSchema }),
  setCoreUrl: fallible({
    input: z.object({ coreUrl: z.string() }),
    data: coreLinkStatusSchema,
    error: coreLinkOperationErrorSchema,
  }),
  generateEnrollmentRequest: fallible({
    input: z.object({ directory: z.string() }),
    data: z.object({ filePath: z.string(), request: enrollmentRequestSchema }),
    error: coreLinkOperationErrorSchema,
  }),
  importEnrollmentResult: fallible({
    input: z.object({ path: z.string() }),
    data: coreLinkStatusSchema,
    error: coreLinkOperationErrorSchema,
  }),
  disconnect: procedure({ input: z.void(), output: coreLinkStatusSchema }),
});

export type ClientOpsCoreContract = typeof clientOpsCoreContract;
