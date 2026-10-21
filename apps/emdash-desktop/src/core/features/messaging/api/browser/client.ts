import type { ContractClient } from '@emdash/wire/rpc';
import { domainClient } from '@core/primitives/wire/browser/connection';
import { messagingContract, messagingDomain } from '../contract';

export type MessagingClient = ContractClient<typeof messagingContract>;

export function getMessagingClient(): Promise<MessagingClient> {
  return domainClient<MessagingClient>(messagingDomain, messagingContract);
}
