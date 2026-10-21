import { describe, expect, it, vi } from 'vitest';
import { OWN_SCOPE } from '../session-scope';
import {
  ObservedSessionsQueryError,
  sessionListQueryKey,
  sessionListQueryOptions,
  sessionTranscriptQueryKey,
  sessionTranscriptQueryOptions,
  workSummaryQueryOptions,
} from './observed-sessions-queries';

vi.mock('./client', () => ({ getObservedSessionsClient: vi.fn() }));

const denied = { state: { error: new ObservedSessionsQueryError('policy_denied', 'no') } };
const fine = { state: { error: null } };

describe('observed sessions query options', () => {
  it('refreshes the summary and lists every 30 seconds and stops when Core refuses', () => {
    const summary = workSummaryQueryOptions();
    expect(summary.staleTime).toBe(30_000);
    const interval = summary.refetchInterval as (query: unknown) => number | false;
    expect(interval(fine)).toBe(30_000);
    expect(interval(denied)).toBe(false);

    const list = sessionListQueryOptions(OWN_SCOPE);
    expect(list.staleTime).toBe(30_000);
    expect((list.refetchInterval as (query: unknown) => number | false)(denied)).toBe(false);
  });

  it('keys each scope and transcript separately under the Core query root', () => {
    expect(sessionListQueryKey({ kind: 'client', clientId: 'a' })).toEqual([
      'clientops-core',
      'observed-sessions',
      'list',
      'client:a',
    ]);
    expect(sessionListQueryKey(OWN_SCOPE)).not.toEqual(
      sessionListQueryKey({ kind: 'client', clientId: 'a' })
    );
    expect(sessionTranscriptQueryKey('s1')).toEqual([
      'clientops-core',
      'observed-sessions',
      'transcript',
      's1',
    ]);
  });

  it('reads a transcript only on demand, never polls it and drops it soon after', async () => {
    const fetcher = vi.fn(async (id: string) => ({
      id,
      source: 'claude',
      host: 'local-mac',
      truncated: false,
      entries: [],
    }));
    const options = sessionTranscriptQueryOptions('s1', fetcher);
    expect(options.refetchInterval).toBeUndefined();
    expect(options.staleTime).toBe(0);
    expect(options.gcTime).toBe(30_000);
    expect(options.retry).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    await (options.queryFn as () => Promise<unknown>)();
    expect(fetcher).toHaveBeenCalledWith('s1');
  });
});
