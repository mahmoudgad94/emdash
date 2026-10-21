import type { ContractClient } from '@emdash/wire/rpc';
import { domainClient } from '@core/primitives/wire/browser/connection';
import { observedSessionsContract, observedSessionsDomain } from '../contract';

export type ObservedSessionsClient = ContractClient<typeof observedSessionsContract>;

export function getObservedSessionsClient(): Promise<ObservedSessionsClient> {
  return domainClient<ObservedSessionsClient>(observedSessionsDomain, observedSessionsContract);
}
