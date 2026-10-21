import { describe, expect, it } from 'vitest';
import { buildDraftRows, describeDraftState } from './need-you';
import { conversation, draft } from './test-support';

describe('describeDraftState', () => {
  it('names the Core draft states', () => {
    expect(describeDraftState('drafted')).toEqual({ label: 'Draft', tone: 'neutral' });
    expect(describeDraftState('awaiting_approval')).toEqual({
      label: 'Awaiting approval',
      tone: 'info',
    });
    expect(describeDraftState('delivery_unknown').tone).toBe('warning');
  });

  it('shows an unknown state as readable words', () => {
    expect(describeDraftState('on_hold').label).toBe('on hold');
  });
});

describe('buildDraftRows', () => {
  it('attaches the client and channel of the conversation a draft belongs to', () => {
    const rows = buildDraftRows([draft()], [conversation()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientName: 'Acme', channel: 'WhatsApp · Website' });
  });

  it('keeps a draft whose conversation is not loaded, under an unknown client', () => {
    const rows = buildDraftRows([draft({ channel: 'x@s.whatsapp.net' })], [conversation()]);
    expect(rows[0]).toMatchObject({ clientName: 'Unknown client', channel: 'x@s.whatsapp.net' });
  });

  it('keeps the order Core gave', () => {
    const rows = buildDraftRows([draft({ id: 'b' }), draft({ id: 'a' })], [conversation()]);
    expect(rows.map((row) => row.draft.id)).toEqual(['b', 'a']);
  });
});
