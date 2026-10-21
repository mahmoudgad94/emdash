import { describe, expect, it } from 'vitest';
import { describeCoreState } from './core-status-view';

describe('describeCoreState', () => {
  it('names every connection state for the settings page', () => {
    expect(describeCoreState({ kind: 'unconfigured' }).label).toBe('Not set up');
    expect(describeCoreState({ kind: 'enrolling', deviceId: 'emdash-1' })).toMatchObject({
      label: 'Waiting for approval',
      tone: 'warning',
    });
    expect(describeCoreState({ kind: 'connected', deviceId: 'emdash-1' })).toMatchObject({
      label: 'Connected',
      tone: 'success',
    });
  });

  it('explains known error codes and falls back to the Core message', () => {
    expect(
      describeCoreState({ kind: 'error', code: 'unreachable', message: 'x' }).detail
    ).toContain('not reachable');
    expect(
      describeCoreState({ kind: 'error', code: 'odd_code', message: 'Core said no' }).detail
    ).toBe('Core said no');
  });
});
