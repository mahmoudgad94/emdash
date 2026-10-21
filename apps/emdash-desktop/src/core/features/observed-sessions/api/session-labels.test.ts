import { describe, expect, it } from 'vitest';
import {
  LIVE_WINDOW_MS,
  compareByLastActivity,
  compareByStart,
  compareByToolCalls,
  hostLabel,
  isLiveSession,
  lastActivityAt,
  lastActivityMs,
  sourceLabel,
} from './session-labels';

const at = (iso: string) => Date.parse(iso);

describe('hostLabel', () => {
  it('names this Mac and the dev server and leaves unknown ids alone', () => {
    expect(hostLabel('local-mac')).toBe('Mac');
    expect(hostLabel('ssh-dev')).toBe('Dev server');
    expect(hostLabel('ssh-anything-else')).toBe('Dev server');
    expect(hostLabel('laptop')).toBe('laptop');
  });
});

describe('sourceLabel', () => {
  it('names the tools and capitalises anything new', () => {
    expect(sourceLabel('claude')).toBe('Claude');
    expect(sourceLabel('codex')).toBe('Codex');
    expect(sourceLabel('git')).toBe('Git');
    expect(sourceLabel('aider')).toBe('Aider');
    expect(sourceLabel('')).toBe('Unknown');
  });
});

describe('last activity', () => {
  const started = '2026-10-21T10:00:00.000Z';

  it('prefers the end time and falls back to the start', () => {
    expect(lastActivityAt({ startedAt: started, endedAt: '2026-10-21T10:30:00.000Z' })).toBe(
      '2026-10-21T10:30:00.000Z'
    );
    expect(lastActivityAt({ startedAt: started, endedAt: null })).toBe(started);
    expect(lastActivityMs({ startedAt: started, endedAt: null })).toBe(at(started));
    expect(lastActivityMs({ startedAt: 'nonsense', endedAt: null })).toBe(0);
  });

  it('counts a session as live only inside the five-minute window', () => {
    const endedAt = '2026-10-21T10:30:00.000Z';
    expect(isLiveSession({ endedAt }, at(endedAt) + LIVE_WINDOW_MS - 1)).toBe(true);
    expect(isLiveSession({ endedAt }, at(endedAt) + LIVE_WINDOW_MS)).toBe(false);
    expect(isLiveSession({ endedAt: null }, Date.now())).toBe(false);
    expect(isLiveSession({ startedAt: started, endedAt: null }, at(started) + 60_000)).toBe(true);
  });
});

describe('sorting', () => {
  const sessions = [
    { id: 'a', startedAt: '2026-10-21T08:00:00Z', endedAt: '2026-10-21T12:00:00Z', toolCalls: 5 },
    { id: 'b', startedAt: '2026-10-21T09:00:00Z', endedAt: '2026-10-21T09:30:00Z', toolCalls: 40 },
    { id: 'c', startedAt: '2026-10-21T10:00:00Z', endedAt: null, toolCalls: null },
  ];

  it('orders by last activity, newest first', () => {
    expect([...sessions].sort(compareByLastActivity).map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('orders by start, newest first', () => {
    expect([...sessions].sort(compareByStart).map((s) => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('orders by tool calls, unknown last, ties by recency', () => {
    expect([...sessions].sort(compareByToolCalls).map((s) => s.id)).toEqual(['b', 'a', 'c']);
    const tied = [
      { ...sessions[1]!, id: 'x', toolCalls: 3 },
      { ...sessions[0]!, id: 'y', toolCalls: 3 },
    ];
    expect([...tied].sort(compareByToolCalls).map((s) => s.id)).toEqual(['y', 'x']);
  });
});
