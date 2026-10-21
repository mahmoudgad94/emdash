import { describe, expect, it } from 'vitest';
import { channelLabel, connectorBadge, previewText, providerLabel } from './labels';
import { conversation } from './test-support';

describe('channelLabel', () => {
  it('reads provider then project, and marks shared groups', () => {
    expect(channelLabel(conversation())).toBe('WhatsApp · Website');
    const source = { ...conversation().source, context: 'shared_group' };
    expect(channelLabel(conversation({ source }))).toBe('WhatsApp group · Website');
  });
});

describe('providerLabel', () => {
  it('names known providers and capitalises others', () => {
    expect(providerLabel('slack')).toBe('Slack');
    expect(providerLabel('signal')).toBe('Signal');
  });
});

describe('connectorBadge', () => {
  it('treats only a healthy connector as healthy', () => {
    expect(connectorBadge('healthy')).toMatchObject({ tone: 'success', healthy: true });
    expect(connectorBadge('catching_up')).toMatchObject({ tone: 'warning', healthy: false });
    expect(connectorBadge('down')).toMatchObject({ tone: 'error', healthy: false });
    expect(connectorBadge(null)).toMatchObject({ tone: 'neutral', healthy: false });
    expect(connectorBadge('something_new')).toMatchObject({ label: 'Unknown', healthy: false });
  });
});

describe('previewText', () => {
  it('collapses whitespace and cuts long text with an ellipsis', () => {
    expect(previewText('a\n\n  b')).toBe('a b');
    expect(previewText('x'.repeat(30), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(previewText('short', 10)).toBe('short');
  });
});
