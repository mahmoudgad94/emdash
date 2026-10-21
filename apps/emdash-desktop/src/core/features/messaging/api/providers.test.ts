import { describe, expect, it } from 'vitest';
import { summarizeProviders } from './providers';

const connector = (provider: string, state: string) => ({
  provider,
  account: `${provider}-1`,
  state,
  lastEventAt: null,
});

describe('summarizeProviders', () => {
  it('lists every known provider and marks the ones Core has no account for', () => {
    expect(summarizeProviders([connector('whatsapp', 'healthy')])).toEqual([
      { provider: 'whatsapp', configured: true, state: 'healthy' },
      { provider: 'slack', configured: false, state: null },
      { provider: 'gmail', configured: false, state: null },
    ]);
  });

  it("reports the worst state across a provider's accounts", () => {
    const statuses = summarizeProviders([
      connector('slack', 'healthy'),
      connector('slack', 'down'),
      connector('slack', 'degraded'),
    ]);
    expect(statuses.find((status) => status.provider === 'slack')?.state).toBe('down');
  });

  it('treats an unknown state as degraded rather than healthy', () => {
    const statuses = summarizeProviders([connector('gmail', 'healthy'), connector('gmail', 'odd')]);
    expect(statuses.find((status) => status.provider === 'gmail')?.state).toBe('odd');
  });
});
