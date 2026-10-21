import type { BadgeTone } from '@emdash/ui/react/primitives';
import type { CoreLinkState } from '../api/schemas';

export type CoreStatusView = { label: string; tone: BadgeTone; detail: string };

const ERROR_DETAIL: Record<string, string> = {
  unreachable: 'Core is not reachable. Check that it is running on this Mac and the URL is right.',
  tls_rejected:
    'The secure connection to Core was refused. The identity may have been revoked, or the URL does not point at Core.',
  timeout: 'Core did not answer in time.',
  unauthenticated: 'Core does not accept this identity. Enroll it again.',
  policy_denied: 'Core refused the identity for this action.',
  unverified: 'Not checked yet.',
};

export function describeCoreError(code: string, message: string): string {
  return ERROR_DETAIL[code] ?? (message || `Core reported ${code}.`);
}

export function describeCoreState(state: CoreLinkState): CoreStatusView {
  switch (state.kind) {
    case 'unconfigured':
      return {
        label: 'Not set up',
        tone: 'neutral',
        detail: 'Export an enrollment request and approve it in the Client Ops Mac app.',
      };
    case 'enrolling':
      return {
        label: 'Waiting for approval',
        tone: 'warning',
        detail: `Request ${state.deviceId} is waiting. Approve it in the Client Ops Mac app, then import the result.`,
      };
    case 'connected':
      return {
        label: 'Connected',
        tone: 'success',
        detail: `This app is enrolled as ${state.deviceId}.`,
      };
    case 'error':
      return {
        label: 'Not connected',
        tone: 'error',
        detail: describeCoreError(state.code, state.message),
      };
  }
}
