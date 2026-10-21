import type { SessionListInput } from './schemas';

/** What the Clients view lists sessions for. */
export type SessionScope =
  | { readonly kind: 'client'; readonly clientId: string }
  | { readonly kind: 'own' }
  | { readonly kind: 'unmatched' };

export const OWN_SCOPE: SessionScope = { kind: 'own' };
export const UNMATCHED_SCOPE: SessionScope = { kind: 'unmatched' };

export function scopeKey(scope: SessionScope): string {
  return scope.kind === 'client' ? `client:${scope.clientId}` : scope.kind;
}

export function sameScope(a: SessionScope | undefined, b: SessionScope | undefined): boolean {
  return a !== undefined && b !== undefined && scopeKey(a) === scopeKey(b);
}

/** The `work.list` arguments for a scope: a client id, `null` for Unmatched, `own` for yours. */
export function scopeListInput(scope: SessionScope): SessionListInput {
  switch (scope.kind) {
    case 'client':
      return { clientId: scope.clientId };
    case 'own':
      return { clientId: null, own: true };
    case 'unmatched':
      return { clientId: null };
  }
}

/** The view params that encode a scope, so the selection survives navigation. */
export type ScopeParams = { clientId?: string; scope?: 'own' | 'unmatched' };

export function scopeToParams(scope: SessionScope): ScopeParams {
  if (scope.kind === 'client') return { clientId: scope.clientId, scope: undefined };
  return { clientId: undefined, scope: scope.kind };
}

export function scopeFromParams(params: ScopeParams): SessionScope | undefined {
  if (params.clientId) return { kind: 'client', clientId: params.clientId };
  if (params.scope === 'own') return OWN_SCOPE;
  if (params.scope === 'unmatched') return UNMATCHED_SCOPE;
  return undefined;
}
