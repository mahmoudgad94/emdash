import { z } from 'zod';

export const clientEnvironmentSchema = z.object({
  name: z.string(),
  url: z.string(),
});

export const clientProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Absolute checkout paths and git remote URLs registered for the project. */
  repos: z.array(z.string()),
  /** Deployed environments the owner registered for the project (staging, production, ...). */
  environments: z.array(clientEnvironmentSchema),
});

export const clientPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
});

export const clientChannelSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  /** `whatsapp`, `slack`, `gmail` or `upwork`. */
  provider: z.string(),
  /** The owner's account on the provider that the channel belongs to. */
  account: z.string(),
  /** The provider's own channel id; what a conversation and a reply are addressed to. */
  channel: z.string(),
  /** `private`, `shared_group` or `announcement`. */
  context: z.string(),
});

export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** `retainer`, `per_task` or `owned`; null when the client has no readable agreement. */
  agreement: z.string().nullable(),
  /** Core offers an inactive client no new work; it stays readable. */
  status: z.enum(['active', 'inactive']),
  /** The dashboard client the owner bound this one to, or null when it is not linked. */
  dashboardRef: z.string().nullable(),
  projects: z.array(clientProjectSchema),
  people: z.array(clientPersonSchema),
  channels: z.array(clientChannelSchema),
});

export const clientsListSchema = z.object({ clients: z.array(clientSchema) });

export const clientActivitySchema = z.object({
  activeNow: z.number(),
  /** Sessions active in the last five minutes, by client id. */
  byClient: z.record(z.string(), z.number()),
});

export const clientWorkInputSchema = z.object({ clientId: z.string() });

export const clientWorkItemSchema = z.object({
  ref: z.string(),
  label: z.string(),
  state: z.string().nullable(),
  at: z.string().nullable(),
});

export const clientWorkSchema = z.object({
  /** False when the client is not bound to a dashboard client; the rest is then empty. */
  linked: z.boolean(),
  contracts: z.array(clientWorkItemSchema),
  payments: z.object({
    count: z.number(),
    /** Sum of the paid amounts in the currency's minor unit; refunds count negative. */
    totalMinor: z.number(),
    currency: z.string().nullable(),
    lastAt: z.string().nullable(),
  }),
  /** When the dashboard was last read completely; null when it never was. */
  asOf: z.string().nullable(),
  stale: z.boolean(),
});

export const repoInspectionInputSchema = z.object({
  repos: z.array(z.string()).max(500),
});

export const repoInspectionSchema = z.object({
  repo: z.string(),
  /** A git remote URL, or a filesystem path. */
  kind: z.enum(['url', 'path']),
  /** The path is a directory on this machine. Always false for a URL. */
  existsHere: z.boolean(),
});

export const repoInspectionListSchema = z.object({
  repos: z.array(repoInspectionSchema),
});

export const clientsErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type ClientEnvironment = z.infer<typeof clientEnvironmentSchema>;
export type ClientProject = z.infer<typeof clientProjectSchema>;
export type ClientPerson = z.infer<typeof clientPersonSchema>;
export type ClientChannel = z.infer<typeof clientChannelSchema>;
export type Client = z.infer<typeof clientSchema>;
export type ClientsList = z.infer<typeof clientsListSchema>;
export type ClientActivity = z.infer<typeof clientActivitySchema>;
export type ClientWorkInput = z.infer<typeof clientWorkInputSchema>;
export type ClientWorkItem = z.infer<typeof clientWorkItemSchema>;
export type ClientWork = z.infer<typeof clientWorkSchema>;
export type RepoInspectionInput = z.infer<typeof repoInspectionInputSchema>;
export type RepoInspection = z.infer<typeof repoInspectionSchema>;
export type RepoInspectionList = z.infer<typeof repoInspectionListSchema>;
export type ClientsError = z.infer<typeof clientsErrorSchema>;
