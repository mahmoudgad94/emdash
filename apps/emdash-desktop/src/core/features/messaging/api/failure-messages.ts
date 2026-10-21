export type MessagingFailure = { title: string; detail: string };

export type MessagingArea = 'conversations' | 'thread' | 'draft' | 'need_you' | 'approval_app';

const NOT_CONNECTED: MessagingFailure = {
  title: 'Client Ops Core is not connected.',
  detail: 'Connect this app to Core in Settings, then try again.',
};

const UNREACHABLE: MessagingFailure = {
  title: 'Core did not answer.',
  detail: 'Check that Core is running and reachable, then try again.',
};

/**
 * What to tell the owner when a messaging call fails. Core refuses with `policy_denied` when
 * this app's identity may not use a tool, which is said plainly per area rather than as a fault.
 */
export function describeMessagingFailure(code: string, area: MessagingArea): MessagingFailure {
  if (code === 'not_connected') return NOT_CONNECTED;
  if (code === 'timeout' || code === 'unreachable') return UNREACHABLE;

  switch (area) {
    case 'conversations':
      if (code === 'policy_denied') {
        return {
          title: 'Core did not allow reading conversations.',
          detail: 'This identity may not read the client inbox.',
        };
      }
      return { title: 'Could not load conversations.', detail: 'This view will retry on its own.' };
    case 'thread':
      if (code === 'not_found') {
        return {
          title: 'This conversation is no longer available.',
          detail: 'Core no longer has it, or it moved. Pick another conversation.',
        };
      }
      if (code === 'policy_denied') {
        return {
          title: 'Core did not allow reading this conversation.',
          detail: 'This identity may not read client messages.',
        };
      }
      return { title: 'Could not load the messages.', detail: 'Try again in a moment.' };
    case 'draft':
      if (code === 'policy_denied') {
        return {
          title: 'Core did not allow saving a draft.',
          detail: 'This identity may not write drafts.',
        };
      }
      if (code === 'paused') {
        return {
          title: 'Replies to this channel are paused in Core.',
          detail: 'Resume the channel in the Client Ops Mac app, then save the draft again.',
        };
      }
      if (code === 'invalid_input' || code === 'unsupported_provider') {
        return {
          title: 'Core did not accept this reply.',
          detail: 'Check the reply and the channel, then try again.',
        };
      }
      return { title: 'Could not save the draft.', detail: 'Your text is still here. Try again.' };
    case 'need_you':
      if (code === 'policy_denied') {
        return {
          title: 'Core does not list waiting drafts for this identity.',
          detail:
            'Only the owner’s devices can read that list. Open the Client Ops Mac app to see and approve drafts.',
        };
      }
      return {
        title: 'Could not load waiting drafts.',
        detail: 'This panel will retry on its own.',
      };
    case 'approval_app':
      if (code === 'app_not_found') {
        return {
          title: 'The Client Ops Mac app was not found.',
          detail: 'Install ClientOps in Applications, then try again.',
        };
      }
      if (code === 'unsupported_platform') {
        return {
          title: 'The Client Ops Mac app only runs on macOS.',
          detail: 'Approve drafts from a Mac.',
        };
      }
      return {
        title: 'Could not open the Client Ops Mac app.',
        detail: 'Open it from Applications.',
      };
  }
}
