import { z } from 'zod';

export const DEFAULT_CORE_URL = 'https://localhost:28443';

/** Written into the folder the owner picks when exporting; imported by the Client Ops Mac app. */
export const ENROLLMENT_REQUEST_FILENAME = 'clientops-enrollment-request.json';

/** Written by the Client Ops Mac app after the owner approves the request. */
export const ENROLLMENT_RESULT_FILENAME = 'enrollment-result.json';

/** Root of every React Query key owned by the Client Ops Core slices. */
export const CLIENT_OPS_QUERY_ROOT = ['clientops-core'] as const;

export const coreLinkStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unconfigured') }),
  z.object({ kind: z.literal('enrolling'), deviceId: z.string() }),
  z.object({ kind: z.literal('connected'), deviceId: z.string() }),
  z.object({
    kind: z.literal('error'),
    code: z.string(),
    message: z.string(),
    deviceId: z.string().optional(),
  }),
]);

export const coreLinkStatusSchema = z.object({
  state: coreLinkStateSchema,
  coreUrl: z.string(),
});

export const enrollmentRequestSchema = z.object({
  deviceId: z.string(),
  csrPem: z.string(),
  approvalKey: z.string(),
  kind: z.literal('assistant'),
  scope: z.object({ tools: z.array(z.string()), actionIds: z.array(z.string()) }),
});

export const coreLinkOperationErrorSchema = z.object({
  type: z.enum([
    'invalid_input',
    'no_pending_request',
    'file_not_found',
    'invalid_result',
    'key_mismatch',
    'openssl_failed',
    'io_failed',
  ]),
  message: z.string(),
});

export type CoreLinkState = z.infer<typeof coreLinkStateSchema>;
export type CoreLinkStatus = z.infer<typeof coreLinkStatusSchema>;
export type EnrollmentRequest = z.infer<typeof enrollmentRequestSchema>;
export type CoreLinkOperationError = z.infer<typeof coreLinkOperationErrorSchema>;
