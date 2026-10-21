import type { ProviderConnector } from './schemas';

/** The providers a client can be reached on, in the order the owner expects to see them. */
export const KNOWN_PROVIDERS = ['whatsapp', 'slack', 'gmail'] as const;

export type ProviderStatus = {
  provider: string;
  /** Core has at least one account for this provider. */
  configured: boolean;
  /** The worst state across the provider's accounts; null when none is configured. */
  state: string | null;
};

const SEVERITY: Record<string, number> = {
  healthy: 0,
  catching_up: 1,
  degraded: 2,
  restricted: 3,
  cursor_lost: 3,
  revoked: 4,
  down: 5,
};

function severityOf(state: string): number {
  return SEVERITY[state] ?? 2;
}

/** One entry per known provider; a provider with no account shows as not configured. */
export function summarizeProviders(connectors: readonly ProviderConnector[]): ProviderStatus[] {
  return KNOWN_PROVIDERS.map((provider) => {
    const accounts = connectors.filter((connector) => connector.provider === provider);
    if (accounts.length === 0) return { provider, configured: false, state: null };
    const worst = accounts.reduce((a, b) => (severityOf(b.state) > severityOf(a.state) ? b : a));
    return { provider, configured: true, state: worst.state };
  });
}
