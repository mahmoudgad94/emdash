import { describe, expect, it } from 'vitest';
import { describeMessagingFailure } from './failure-messages';

describe('describeMessagingFailure', () => {
  it('sends the owner to Settings when the app is not connected, in every area', () => {
    for (const area of ['conversations', 'thread', 'draft', 'need_you'] as const) {
      expect(describeMessagingFailure('not_connected', area).title).toMatch(/not connected/);
    }
  });

  it('says plainly when Core refuses the waiting-drafts list and points to the Mac app', () => {
    const failure = describeMessagingFailure('policy_denied', 'need_you');
    expect(failure.title).toMatch(/does not list waiting drafts/);
    expect(failure.detail).toMatch(/Client Ops Mac app/);
  });

  it('explains a refused draft by cause', () => {
    expect(describeMessagingFailure('policy_denied', 'draft').title).toMatch(/not allow saving/);
    expect(describeMessagingFailure('paused', 'draft').title).toMatch(/paused/);
    expect(describeMessagingFailure('invalid_input', 'draft').title).toMatch(/did not accept/);
    expect(describeMessagingFailure('boom', 'draft').detail).toMatch(/text is still here/);
  });

  it('reports a conversation Core no longer has', () => {
    expect(describeMessagingFailure('not_found', 'thread').title).toMatch(/no longer available/);
  });

  it('treats a timeout and an unreachable Core the same', () => {
    expect(describeMessagingFailure('timeout', 'thread')).toEqual(
      describeMessagingFailure('unreachable', 'conversations')
    );
  });

  it('explains why the Mac app could not be opened', () => {
    expect(describeMessagingFailure('app_not_found', 'approval_app').title).toMatch(/not found/);
    expect(describeMessagingFailure('unsupported_platform', 'approval_app').title).toMatch(/macOS/);
    expect(describeMessagingFailure('open_failed', 'approval_app').title).toMatch(/Could not open/);
  });
});
