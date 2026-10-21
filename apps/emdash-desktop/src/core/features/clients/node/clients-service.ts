import { stat } from 'node:fs/promises';
import { err, ok, type Result } from '@emdash/shared';
import { z } from 'zod';
import type {
  CoreInvoker,
  CoreLinkError,
} from '@core/features/clientops-core/api/node/core-invoker';
import { normalizeAbsolutePath, normalizeRemoteUrl } from '../api/match-projects';
import type {
  Client,
  ClientActivity,
  ClientChannel,
  ClientPerson,
  ClientProject,
  ClientsList,
  ClientWork,
  ClientWorkItem,
  RepoInspection,
  RepoInspectionList,
  UnlinkedClients,
} from '../api/schemas';

const MAX_PAGES = 10;
const DETAIL_CONCURRENCY = 4;
const INSPECT_CONCURRENCY = 16;

const listPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      agreementKind: z.string().nullish(),
    })
  ),
  truncated: z.boolean().optional(),
});

const detailSchema = z.object({
  document: z
    .object({
      status: z.enum(['active', 'inactive']).optional(),
      dashboardRef: z.object({ clientRef: z.string() }).nullish(),
      projects: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            repos: z.array(z.string()).optional(),
            environments: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
          })
        )
        .optional(),
      people: z.array(z.object({ id: z.string(), name: z.string(), role: z.string() })).optional(),
      channels: z
        .array(
          z.object({
            id: z.string(),
            projectId: z.string(),
            provider: z.string(),
            account: z.string(),
            providerChannelId: z.string(),
            context: z.string(),
          })
        )
        .optional(),
    })
    .nullish(),
});

const summarySchema = z.object({
  activeNow: z.number().optional(),
  clients: z
    .array(
      z.object({
        clientId: z.string().nullable(),
        active: z.number().optional(),
      })
    )
    .optional(),
});

const dashboardPageSchema = z.object({
  items: z.array(
    z.object({
      ref: z.string(),
      label: z.string(),
      state: z.string().nullable(),
      amountMinor: z.number().nullable(),
      currency: z.string().nullable(),
      at: z.string().nullable(),
    })
  ),
  asOf: z.string().nullable(),
  stale: z.boolean(),
});

const unreadable = (tool: string): CoreLinkError => ({
  code: 'invalid_response',
  message: `Core sent an unexpected ${tool} response`,
});

async function mapConcurrently<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function listSummaries(
  core: CoreInvoker
): Promise<Result<z.infer<typeof listPageSchema>['items'], CoreLinkError>> {
  const items: z.infer<typeof listPageSchema>['items'] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await core.invoke('clients.list', after === undefined ? {} : { after });
    if (!response.success) return response;
    const parsed = listPageSchema.safeParse(response.data);
    if (!parsed.success) return err(unreadable('clients.list'));
    items.push(...parsed.data.items);
    const last = parsed.data.items.at(-1);
    if (!parsed.data.truncated || !last) break;
    after = last.id;
  }
  return ok(items);
}

type ClientDetail = Pick<Client, 'status' | 'dashboardRef' | 'projects' | 'people' | 'channels'>;

const EMPTY_DETAIL: ClientDetail = {
  status: 'active',
  dashboardRef: null,
  projects: [],
  people: [],
  channels: [],
};

async function readDetail(
  core: CoreInvoker,
  id: string
): Promise<Result<ClientDetail, CoreLinkError>> {
  const response = await core.invoke('clients.get', { id });
  // A client without a saved configuration simply has nothing registered yet.
  if (!response.success) return response.error.code === 'not_found' ? ok(EMPTY_DETAIL) : response;
  const parsed = detailSchema.safeParse(response.data);
  if (!parsed.success) return err(unreadable('clients.get'));
  const document = parsed.data.document;
  if (!document) return ok(EMPTY_DETAIL);
  const projects: ClientProject[] = (document.projects ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    repos: project.repos ?? [],
    environments: project.environments ?? [],
  }));
  const people: ClientPerson[] = document.people ?? [];
  const channels: ClientChannel[] = (document.channels ?? []).map((channel) => ({
    id: channel.id,
    projectId: channel.projectId,
    provider: channel.provider,
    account: channel.account,
    channel: channel.providerChannelId,
    context: channel.context,
  }));
  return ok({
    status: document.status ?? 'active',
    dashboardRef: document.dashboardRef?.clientRef ?? null,
    projects,
    people,
    channels,
  });
}

/** Every client with what Core registered for it: projects, repositories, people and channels. */
export async function listClients(core: CoreInvoker): Promise<Result<ClientsList, CoreLinkError>> {
  const summaries = await listSummaries(core);
  if (!summaries.success) return summaries;
  const details = await mapConcurrently(summaries.data, DETAIL_CONCURRENCY, (summary) =>
    readDetail(core, summary.id)
  );
  const clients: Client[] = [];
  for (const [index, summary] of summaries.data.entries()) {
    const detail = details[index]!;
    if (!detail.success) return detail;
    clients.push({
      id: summary.id,
      name: summary.name,
      agreement: summary.agreementKind ?? null,
      ...detail.data,
    });
  }
  return ok({ clients });
}

/** Live sessions per client from `work.summary`; a Core refusal is passed on so the badges can hide. */
export async function readClientActivity(
  core: CoreInvoker
): Promise<Result<ClientActivity, CoreLinkError>> {
  const response = await core.invoke('work.summary', {});
  if (!response.success) return response;
  const parsed = summarySchema.safeParse(response.data);
  if (!parsed.success) return err(unreadable('work.summary'));
  const byClient: Record<string, number> = {};
  for (const entry of parsed.data.clients ?? []) {
    if (entry.clientId !== null) byClient[entry.clientId] = entry.active ?? 0;
  }
  return ok({ activeNow: parsed.data.activeNow ?? 0, byClient });
}

const NOT_LINKED: ClientWork = {
  linked: false,
  contracts: [],
  payments: { count: 0, totalMinor: 0, currency: null, lastAt: null },
  asOf: null,
  stale: false,
};

async function readDashboard(
  core: CoreInvoker,
  kind: 'contracts' | 'payments',
  clientRef: string
): Promise<Result<z.infer<typeof dashboardPageSchema>, CoreLinkError>> {
  const response = await core.invoke('dashboard.read', { kind, clientRef });
  if (!response.success) return response;
  const parsed = dashboardPageSchema.safeParse(response.data);
  return parsed.success ? ok(parsed.data) : err(unreadable('dashboard.read'));
}

/**
 * Contracts and payments the dashboard holds for a client, through the dashboard client Core
 * bound it to. A client without a binding is reported as not linked rather than as empty.
 */
export async function readClientWork(
  core: CoreInvoker,
  clientId: string
): Promise<Result<ClientWork, CoreLinkError>> {
  const detail = await readDetail(core, clientId);
  if (!detail.success) return detail;
  const clientRef = detail.data.dashboardRef;
  if (clientRef === null) return ok(NOT_LINKED);
  const contracts = await readDashboard(core, 'contracts', clientRef);
  if (!contracts.success) return contracts;
  const payments = await readDashboard(core, 'payments', clientRef);
  if (!payments.success) return payments;
  const paid = payments.data.items.filter((item) => item.amountMinor !== null);
  const lastAt = paid
    .map((item) => item.at)
    .filter((at): at is string => at !== null)
    .sort()
    .at(-1);
  const items: ClientWorkItem[] = contracts.data.items.map((item) => ({
    ref: item.ref,
    label: item.label,
    state: item.state,
    at: item.at,
  }));
  return ok({
    linked: true,
    contracts: items,
    payments: {
      count: paid.length,
      totalMinor: paid.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0),
      currency: paid.find((item) => item.currency !== null)?.currency ?? null,
      lastAt: lastAt ?? null,
    },
    // The older of the two reads: what every number on the page is at least as fresh as.
    asOf:
      [contracts.data.asOf, payments.data.asOf]
        .filter((at): at is string => at !== null)
        .sort()
        .at(0) ?? null,
    stale: contracts.data.stale || payments.data.stale,
  });
}

export type DirectoryCheck = (path: string) => Promise<boolean>;

const isDirectory: DirectoryCheck = async (path) => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Tells registered repositories apart: git remote URLs, and paths that are directories on this
 * machine. A path that is not absolute is reported as a path that does not exist here.
 */
export async function inspectRepos(
  repos: readonly string[],
  exists: DirectoryCheck = isDirectory
): Promise<Result<RepoInspectionList, CoreLinkError>> {
  const inspected = await mapConcurrently(
    repos,
    INSPECT_CONCURRENCY,
    async (repo): Promise<RepoInspection> => {
      if (normalizeRemoteUrl(repo) !== undefined) return { repo, kind: 'url', existsHere: false };
      const path = normalizeAbsolutePath(repo);
      return {
        repo,
        kind: 'path',
        existsHere: path !== undefined && (await exists(path)),
      };
    }
  );
  return ok({ repos: inspected });
}

const dashboardClientsSchema = z.object({
  items: z.array(z.object({ ref: z.string(), label: z.string(), state: z.string().nullable() })),
  asOf: z.string().nullable(),
  stale: z.boolean(),
});

/**
 * Active clients on the dashboard that no Core client is bound to. These are real clients the
 * owner works for that Core does not know yet, so they are listed rather than hidden.
 */
export async function readUnlinkedClients(
  core: CoreInvoker
): Promise<Result<UnlinkedClients, CoreLinkError>> {
  const clients = await listClients(core);
  if (!clients.success) return clients;
  const response = await core.invoke('dashboard.read', { kind: 'clients' });
  if (!response.success) return response;
  const parsed = dashboardClientsSchema.safeParse(response.data);
  if (!parsed.success) return err(unreadable('dashboard.read'));
  const bound = new Set(
    clients.data.clients.flatMap((c) => (c.dashboardRef ? [c.dashboardRef] : []))
  );
  return ok({
    clients: parsed.data.items
      .filter((item) => item.state === 'active' && !bound.has(item.ref))
      .map((item) => ({ ref: item.ref, name: item.label }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    asOf: parsed.data.asOf,
    stale: parsed.data.stale,
  });
}
