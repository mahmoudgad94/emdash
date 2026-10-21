import { describe, expect, it } from 'vitest';
import type { LiveSession, ObservedSession } from './schemas';
import { clientLabelOf, findSessionInfo, sessionInfoOf } from './session-info';

const names = new Map([['acme', 'Acme']]);

const session = (over: Partial<ObservedSession>): ObservedSession => ({
  id: 's1',
  clientId: 'acme',
  projectId: 'p1',
  status: 'observed',
  host: 'ssh-dev',
  source: 'codex',
  startedAt: '2026-10-21T09:00:00.000Z',
  endedAt: '2026-10-21T09:30:00.000Z',
  branch: 'main',
  toolCalls: 12,
  filesTouched: 3,
  commits: [],
  own: false,
  ...over,
});

const liveSession: LiveSession = {
  id: 'l1',
  clientId: null,
  clientName: null,
  own: true,
  host: 'local-mac',
  source: 'claude',
  branch: null,
  toolCalls: null,
  endedAt: '2026-10-21T10:00:00.000Z',
};

describe('clientLabelOf', () => {
  it("names the client, the owner's own work, or Unmatched", () => {
    expect(clientLabelOf({ clientId: 'acme', own: false }, names)).toBe('Acme');
    expect(clientLabelOf({ clientId: 'zzz', own: false, clientName: 'Zed' }, names)).toBe('Zed');
    expect(clientLabelOf({ clientId: null, own: true }, names)).toBe('Your projects');
    expect(clientLabelOf({ clientId: null, own: false }, names)).toBe('Unmatched');
  });
});

describe('sessionInfoOf / findSessionInfo', () => {
  it('summarises listed and live sessions the same way', () => {
    expect(sessionInfoOf(session({}), names)).toEqual({
      id: 's1',
      clientLabel: 'Acme',
      source: 'codex',
      host: 'ssh-dev',
      branch: 'main',
      toolCalls: 12,
      startedAt: '2026-10-21T09:00:00.000Z',
      endedAt: '2026-10-21T09:30:00.000Z',
    });
    expect(sessionInfoOf(liveSession, names)).toMatchObject({
      clientLabel: 'Your projects',
      startedAt: null,
      branch: null,
    });
  });

  it('looks in the list first, then in the live sessions', () => {
    const listed = [session({})];
    expect(findSessionInfo('s1', listed, [liveSession], names)?.clientLabel).toBe('Acme');
    expect(findSessionInfo('l1', listed, [liveSession], names)?.clientLabel).toBe('Your projects');
    expect(findSessionInfo('nope', listed, [liveSession], names)).toBeUndefined();
  });
});
