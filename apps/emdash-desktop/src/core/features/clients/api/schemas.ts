import { z } from 'zod';

export const clientProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Absolute checkout paths and git remote URLs registered for the project. */
  repos: z.array(z.string()),
});

export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** `retainer`, `per_task` or `owned`; null when the client has no readable agreement. */
  agreement: z.string().nullable(),
  projects: z.array(clientProjectSchema),
});

export const clientsListSchema = z.object({ clients: z.array(clientSchema) });

export const clientActivitySchema = z.object({
  activeNow: z.number(),
  /** Sessions active in the last five minutes, by client id. */
  byClient: z.record(z.string(), z.number()),
});

export const clientsErrorSchema = z.object({ code: z.string(), message: z.string() });

export type ClientProject = z.infer<typeof clientProjectSchema>;
export type Client = z.infer<typeof clientSchema>;
export type ClientsList = z.infer<typeof clientsListSchema>;
export type ClientActivity = z.infer<typeof clientActivitySchema>;
export type ClientsError = z.infer<typeof clientsErrorSchema>;
