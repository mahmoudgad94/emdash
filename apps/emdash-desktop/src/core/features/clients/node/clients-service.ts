import { err, ok, type Result } from '@emdash/shared';
import { z } from 'zod';
import type {
  CoreInvoker,
  CoreLinkError,
} from '@core/features/clientops-core/api/node/core-invoker';
import type { Client, ClientActivity, ClientProject, ClientsList } from '../api/schemas';

const MAX_PAGES = 10;
const DETAIL_CONCURRENCY = 4;

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
      projects: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            repos: z.array(z.string()).optional(),
          })
        )
        .optional(),
    })
    .nullish(),
});

const summarySchema = z.object({
  activeNow: z.number().optional(),
  clients: z
    .array(z.object({ clientId: z.string().nullable(), active: z.number().optional() }))
    .optional(),
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

async function readProjects(
  core: CoreInvoker,
  id: string
): Promise<Result<ClientProject[], CoreLinkError>> {
  const response = await core.invoke('clients.get', { id });
  // A client without a saved configuration simply has no projects yet.
  if (!response.success) return response.error.code === 'not_found' ? ok([]) : response;
  const parsed = detailSchema.safeParse(response.data);
  if (!parsed.success) return err(unreadable('clients.get'));
  return ok(
    (parsed.data.document?.projects ?? []).map((project) => ({
      id: project.id,
      name: project.name,
      repos: project.repos ?? [],
    }))
  );
}

/** Every client with the projects and repositories registered for it. */
export async function listClients(core: CoreInvoker): Promise<Result<ClientsList, CoreLinkError>> {
  const summaries = await listSummaries(core);
  if (!summaries.success) return summaries;
  const details = await mapConcurrently(summaries.data, DETAIL_CONCURRENCY, (summary) =>
    readProjects(core, summary.id)
  );
  const clients: Client[] = [];
  for (const [index, summary] of summaries.data.entries()) {
    const projects = details[index]!;
    if (!projects.success) return projects;
    clients.push({
      id: summary.id,
      name: summary.name,
      agreement: summary.agreementKind ?? null,
      projects: projects.data,
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
