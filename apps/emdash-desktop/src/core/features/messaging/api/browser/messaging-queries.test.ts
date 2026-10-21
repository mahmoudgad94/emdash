import { describe, expect, it, vi } from 'vitest';
import {
  conversationMessagesQueryKey,
  conversationMessagesQueryOptions,
  conversationsQueryOptions,
  MessagingQueryError,
  needYouQueryOptions,
} from './messaging-queries';

vi.mock('./client', () => ({ getMessagingClient: vi.fn() }));

const denied = { state: { error: new MessagingQueryError('policy_denied', 'no') } };
const missing = { state: { error: new MessagingQueryError('not_found', 'gone') } };
const fine = { state: { error: null } };

type Interval = (query: unknown) => number | false;

describe('messaging query options', () => {
  it('refreshes conversations every 30 seconds and stops when Core refuses', () => {
    const options = conversationsQueryOptions();
    expect(options.staleTime).toBe(30_000);
    expect((options.refetchInterval as Interval)(fine)).toBe(30_000);
    expect((options.refetchInterval as Interval)(denied)).toBe(false);
    expect(options.retry).toBe(false);
  });

  it('refreshes the open conversation every 15 seconds and stops once it is gone', () => {
    const options = conversationMessagesQueryOptions('cv1.a');
    expect(options.staleTime).toBe(15_000);
    expect((options.refetchInterval as Interval)(fine)).toBe(15_000);
    expect((options.refetchInterval as Interval)(missing)).toBe(false);
    expect((options.refetchInterval as Interval)(denied)).toBe(false);
  });

  it('refreshes the waiting drafts every 30 seconds and stops when Core refuses the list', () => {
    const options = needYouQueryOptions();
    expect(options.staleTime).toBe(30_000);
    expect((options.refetchInterval as Interval)(fine)).toBe(30_000);
    expect((options.refetchInterval as Interval)(denied)).toBe(false);
  });

  it('keys each conversation separately under the Core query root', () => {
    expect(conversationMessagesQueryKey('cv1.a')).toEqual([
      'clientops-core',
      'messaging',
      'messages',
      'cv1.a',
    ]);
    expect(conversationMessagesQueryKey('cv1.a')).not.toEqual(
      conversationMessagesQueryKey('cv1.b')
    );
  });

  it('reads the conversation passed to the fetcher', async () => {
    const fetcher = vi.fn(async (id: string) => ({
      id,
      provider: 'whatsapp',
      source: {
        clientId: 'a',
        clientName: 'A',
        projectId: 'p',
        projectName: 'P',
        channelId: 'c',
        channel: 'x',
        account: null,
        context: 'private',
      },
      messages: [],
      truncated: false,
    }));
    const options = conversationMessagesQueryOptions('cv1.a', fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    await (options.queryFn as () => Promise<unknown>)();
    expect(fetcher).toHaveBeenCalledWith('cv1.a');
  });
});
