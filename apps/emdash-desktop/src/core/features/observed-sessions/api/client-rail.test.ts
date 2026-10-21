import { describe, expect, it } from 'vitest';
import { buildClientRail, defaultScope } from './client-rail';
import type { WorkSummary } from './schemas';

const live = (id: string, own: boolean) => ({
  id,
  clientId: own ? null : 'acme',
  clientName: own ? null : 'Acme',
  own,
  host: 'local-mac',
  source: 'claude',
  branch: null,
  toolCalls: null,
  endedAt: '2026-10-21T10:00:00.000Z',
});

const summary: WorkSummary = {
  total: 9,
  own: 2,
  activeNow: 3,
  active: [live('1', false), live('2', true), live('3', true)],
  clients: [
    { clientId: 'acme', clientName: 'Acme', count: 5, active: 1 },
    { clientId: 'ghost', clientName: 'Ghost Ltd', count: 1, active: 0 },
    { clientId: null, clientName: null, count: 1, active: 0 },
  ],
};

describe('buildClientRail', () => {
  const rail = buildClientRail(
    [
      { id: 'acme', name: 'Acme' },
      { id: 'globex', name: 'Globex' },
    ],
    summary
  );

  it("lists every known client with Core's counts, in the clients slice order", () => {
    expect(rail.clients.slice(0, 2).map((e) => [e.label, e.count, e.active])).toEqual([
      ['Acme', 5, 1],
      ['Globex', 0, 0],
    ]);
  });

  it('keeps captured work for a client the list does not know yet', () => {
    expect(rail.clients[2]).toMatchObject({
      label: 'Ghost Ltd',
      count: 1,
      scope: { kind: 'client', clientId: 'ghost' },
    });
  });

  it("reports the owner's own projects and Unmatched", () => {
    expect(rail.own).toMatchObject({ label: 'Your projects', count: 2, active: 2 });
    expect(rail.unmatched).toMatchObject({ label: 'Unmatched', count: 1, active: 0 });
  });

  it('is empty but usable before anything loads', () => {
    const empty = buildClientRail([], undefined);
    expect(empty.clients).toEqual([]);
    expect(empty.own.count).toBe(0);
    expect(empty.unmatched.count).toBe(0);
  });
});

describe('defaultScope', () => {
  it('opens the first client that has sessions', () => {
    const rail = buildClientRail(
      [
        { id: 'globex', name: 'Globex' },
        { id: 'acme', name: 'Acme' },
      ],
      summary
    );
    expect(defaultScope(rail)).toEqual({ kind: 'client', clientId: 'acme' });
  });

  it("falls back to the first client, then to the owner's own projects", () => {
    expect(defaultScope(buildClientRail([{ id: 'x', name: 'X' }], undefined))).toEqual({
      kind: 'client',
      clientId: 'x',
    });
    expect(defaultScope(buildClientRail([], undefined))).toEqual({ kind: 'own' });
  });
});
