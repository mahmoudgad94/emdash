import type { ContractClient } from '@emdash/wire/rpc';
import { domainClient } from '@core/primitives/wire/browser/connection';
import { clientsContract, clientsDomain } from '../contract';

export type ClientsClient = ContractClient<typeof clientsContract>;

export function getClientsClient(): Promise<ClientsClient> {
  return domainClient<ClientsClient>(clientsDomain, clientsContract);
}
