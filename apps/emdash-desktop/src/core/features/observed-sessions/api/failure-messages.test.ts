import { describe, expect, it } from 'vitest';
import { describeSessionsFailure, describeTranscriptFailure } from './failure-messages';

describe('describeTranscriptFailure', () => {
  it('says the machine may be offline or the log gone when Core cannot read it', () => {
    for (const code of ['not_found', 'invalid_input']) {
      const failure = describeTranscriptFailure(code);
      expect(failure.title).toContain('cannot be read');
      expect(failure.detail).toContain('offline');
      expect(failure.detail).toContain('log is gone');
    }
  });

  it('tells connection faults apart from a missing log', () => {
    expect(describeTranscriptFailure('not_connected').title).toContain('not connected');
    expect(describeTranscriptFailure('unreachable').title).toContain('did not answer');
    expect(describeTranscriptFailure('policy_denied').title).toContain('did not allow');
    expect(describeTranscriptFailure('weird').title).toContain('Could not load');
  });
});

describe('describeSessionsFailure', () => {
  it('points an unconnected app at Settings', () => {
    expect(describeSessionsFailure('not_connected').detail).toContain('Settings');
  });

  it('has a generic message for anything else', () => {
    expect(describeSessionsFailure('boom').title).toBe('Could not load sessions.');
  });
});
