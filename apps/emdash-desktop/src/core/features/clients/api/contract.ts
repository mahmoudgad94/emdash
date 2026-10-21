import { defineContract, fallible } from '@emdash/wire/rpc';
import { z } from 'zod';
import { clientActivitySchema, clientsErrorSchema, clientsListSchema } from './schemas';

export const clientsDomain = 'clients' as const;

export const clientsContract = defineContract({
  list: fallible({ input: z.void(), data: clientsListSchema, error: clientsErrorSchema }),
  activity: fallible({ input: z.void(), data: clientActivitySchema, error: clientsErrorSchema }),
});

export type ClientsContract = typeof clientsContract;
