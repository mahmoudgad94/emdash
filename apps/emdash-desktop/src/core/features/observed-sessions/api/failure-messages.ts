export type TranscriptFailure = { title: string; detail: string };

/**
 * What to tell the owner when a transcript cannot be read. Core answers `not_found` or
 * `invalid_input` ("work transcript unavailable") when the machine that ran the session is
 * offline or its log is gone; the remaining codes are about reaching Core itself.
 */
export function describeTranscriptFailure(code: string): TranscriptFailure {
  switch (code) {
    case 'not_found':
    case 'invalid_input':
      return {
        title: 'This conversation cannot be read right now.',
        detail:
          'The machine that ran it may be offline, or the session log is gone. Core reads the log live and keeps no copy.',
      };
    case 'not_connected':
      return {
        title: 'Client Ops Core is not connected.',
        detail: 'Connect this app to Core in Settings, then try again.',
      };
    case 'policy_denied':
      return {
        title: 'Core did not allow reading this conversation.',
        detail: 'This identity may not read session transcripts.',
      };
    case 'timeout':
    case 'unreachable':
      return {
        title: 'Core did not answer.',
        detail: 'Check that Core is running and reachable, then try again.',
      };
    default:
      return {
        title: 'Could not load the conversation.',
        detail: 'Try again in a moment.',
      };
  }
}

/** What to tell the owner when the client or session lists cannot be loaded. */
export function describeSessionsFailure(code: string): TranscriptFailure {
  switch (code) {
    case 'not_connected':
      return {
        title: 'Client Ops Core is not connected.',
        detail: 'Connect this app to Core in Settings to see captured sessions.',
      };
    case 'policy_denied':
      return {
        title: 'Core did not allow reading sessions.',
        detail: 'This identity may not read observed work.',
      };
    case 'timeout':
    case 'unreachable':
      return {
        title: 'Core did not answer.',
        detail: 'Check that Core is running and reachable. This view will retry on its own.',
      };
    default:
      return {
        title: 'Could not load sessions.',
        detail: 'This view will retry on its own.',
      };
  }
}
