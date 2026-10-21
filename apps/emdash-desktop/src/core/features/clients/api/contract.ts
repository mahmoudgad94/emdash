import { defineContract, fallible } from '@emdash/wire/rpc';
import { z } from 'zod';
import {
  clientActivitySchema,
  clientsErrorSchema,
  clientsListSchema,
  clientWorkInputSchema,
  clientWorkSchema,
  repoInspectionInputSchema,
  repoInspectionListSchema,
} from './schemas';

export const clientsDomain = 'clients' as const;

export const clientsContract = defineContract({
  list: fallible({
    input: z.void(),
    data: clientsListSchema,
    error: clientsErrorSchema,
  }),
  activity: fallible({
    input: z.void(),
    data: clientActivitySchema,
    error: clientsErrorSchema,
  }),
  /** Contracts and payments the dashboard holds for one client. */
  work: fallible({
    input: clientWorkInputSchema,
    data: clientWorkSchema,
    error: clientsErrorSchema,
  }),
  /** Which registered repositories are URLs, and which paths exist on this machine. */
  inspectRepos: fallible({
    input: repoInspectionInputSchema,
    data: repoInspectionListSchema,
    error: clientsErrorSchema,
  }),
});

export type ClientsContract = typeof clientsContract;
