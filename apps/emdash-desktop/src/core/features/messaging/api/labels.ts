import type { ConversationSummary } from './schemas';

const PROVIDER_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  gmail: 'Gmail',
};

export function providerLabel(provider: string): string {
  return (
    PROVIDER_LABELS[provider] ??
    (provider ? provider[0]!.toUpperCase() + provider.slice(1) : 'Unknown')
  );
}

/** "WhatsApp · Website" or "WhatsApp group · Website": the provider, then the client's project. */
export function channelLabel(
  conversation: Pick<ConversationSummary, 'provider' | 'source'>
): string {
  const kind = conversation.source.context === 'shared_group' ? ' group' : '';
  return `${providerLabel(conversation.provider)}${kind} · ${conversation.source.projectName}`;
}

export type ConnectorTone = 'success' | 'warning' | 'error' | 'neutral';

export type ConnectorBadge = { tone: ConnectorTone; label: string; healthy: boolean };

/** How a Core connector state reads to the owner. */
export function connectorBadge(state: string | null): ConnectorBadge {
  switch (state) {
    case 'healthy':
      return { tone: 'success', label: 'Connected', healthy: true };
    case 'catching_up':
      return { tone: 'warning', label: 'Catching up', healthy: false };
    case 'degraded':
      return { tone: 'warning', label: 'Degraded', healthy: false };
    case 'down':
      return { tone: 'error', label: 'Down', healthy: false };
    case 'cursor_lost':
      return { tone: 'error', label: 'Resync needed', healthy: false };
    case 'revoked':
      return { tone: 'error', label: 'Access revoked', healthy: false };
    case 'restricted':
      return { tone: 'error', label: 'Restricted', healthy: false };
    default:
      return { tone: 'neutral', label: 'Unknown', healthy: false };
  }
}

const PREVIEW_MAX = 140;

/** One line of a message for a list row: whitespace collapsed, cut with an ellipsis. */
export function previewText(text: string, max = PREVIEW_MAX): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
