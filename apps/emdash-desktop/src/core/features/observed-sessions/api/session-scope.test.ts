import { describe, expect, it } from 'vitest';
import {
  OWN_SCOPE,
  UNMATCHED_SCOPE,
  sameScope,
  scopeFromParams,
  scopeKey,
  scopeListInput,
  scopeToParams,
} from './session-scope';

describe('session scope', () => {
  it("asks Core for a client, for Unmatched, or for the owner's own projects", () => {
    expect(scopeListInput({ kind: 'client', clientId: 'acme' })).toEqual({ clientId: 'acme' });
    expect(scopeListInput(UNMATCHED_SCOPE)).toEqual({ clientId: null });
    expect(scopeListInput(OWN_SCOPE)).toEqual({ clientId: null, own: true });
  });

  it('round-trips through view params', () => {
    for (const scope of [
      { kind: 'client', clientId: 'acme' } as const,
      OWN_SCOPE,
      UNMATCHED_SCOPE,
    ]) {
      expect(scopeFromParams(scopeToParams(scope))).toEqual(scope);
    }
    expect(scopeFromParams({})).toBeUndefined();
  });

  it('clears the other half of the params when the scope changes', () => {
    expect(scopeToParams(OWN_SCOPE)).toEqual({ clientId: undefined, scope: 'own' });
    expect(scopeToParams({ kind: 'client', clientId: 'a' })).toEqual({
      clientId: 'a',
      scope: undefined,
    });
  });

  it('compares scopes by key', () => {
    expect(scopeKey({ kind: 'client', clientId: 'a' })).toBe('client:a');
    expect(sameScope(OWN_SCOPE, { kind: 'own' })).toBe(true);
    expect(sameScope(OWN_SCOPE, UNMATCHED_SCOPE)).toBe(false);
    expect(sameScope(undefined, OWN_SCOPE)).toBe(false);
  });
});
