import { connectorBadge, type ConnectorTone } from '../api/labels';

const TONE_CLASS: Record<ConnectorTone, string> = {
  success: 'bg-foreground-success',
  warning: 'bg-foreground-warning',
  error: 'bg-foreground-destructive',
  neutral: 'bg-foreground-passive',
};

/** A small status dot for a Core connector; the state is also exposed as its title and label. */
export function ConnectorDot({ state }: { state: string | null }) {
  const badge = connectorBadge(state);
  return (
    <span
      role="img"
      aria-label={`Connector: ${badge.label}`}
      title={`Connector: ${badge.label}`}
      className={`inline-block size-2 shrink-0 rounded-full ${TONE_CLASS[badge.tone]}`}
    />
  );
}
