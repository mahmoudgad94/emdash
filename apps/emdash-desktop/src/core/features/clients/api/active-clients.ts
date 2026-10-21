import type { Client } from './schemas';

/** The clients the owner is working for now: Core's active ones, in Core's order. */
export function activeClients<T extends Pick<Client, 'status'>>(clients: readonly T[]): T[] {
  return clients.filter((client) => client.status === 'active');
}

/** How many clients are left out of the default list. */
export function hiddenClientCount(clients: readonly Pick<Client, 'status'>[]): number {
  return clients.length - activeClients(clients).length;
}
