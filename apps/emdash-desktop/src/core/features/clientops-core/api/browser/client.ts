import type { ContractClient } from '@emdash/wire/rpc';
import { domainClient } from '@core/primitives/wire/browser/connection';
import { clientOpsCoreContract, clientOpsCoreDomain } from '../contract';

export type ClientOpsCoreClient = ContractClient<typeof clientOpsCoreContract>;

export function getClientOpsCoreClient(): Promise<ClientOpsCoreClient> {
  return domainClient<ClientOpsCoreClient>(clientOpsCoreDomain, clientOpsCoreContract);
}
