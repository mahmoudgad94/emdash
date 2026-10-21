import type { ProjectMatch } from './match-projects';
import type { Client } from './schemas';

export const OWN_PROJECTS_GROUP_KEY = 'own';
export const OWN_PROJECTS_LABEL = 'Your projects';

export type ClientProjectGroup = {
  key: string;
  label: string;
  /** Set for a client's group; absent for "Your projects". */
  clientId?: string;
  projectIds: string[];
};

/**
 * Splits an ordered project list into one group per client that owns at least one of the
 * projects (by client name) followed by "Your projects" for the rest. Order inside a group is
 * the input order. Returns undefined when no project belongs to a client, so callers keep
 * showing the plain list.
 */
export function groupProjectsByClient(
  orderedProjectIds: readonly string[],
  matches: ReadonlyMap<string, ProjectMatch>,
  clients: readonly Client[]
): ClientProjectGroup[] | undefined {
  const names = new Map(clients.map((client) => [client.id, client.name]));
  const byClient = new Map<string, string[]>();
  const own: string[] = [];
  for (const projectId of orderedProjectIds) {
    const clientId = matches.get(projectId)?.clientId;
    if (clientId === undefined || !names.has(clientId)) {
      own.push(projectId);
      continue;
    }
    const group = byClient.get(clientId);
    if (group) group.push(projectId);
    else byClient.set(clientId, [projectId]);
  }
  if (byClient.size === 0) return undefined;
  const groups: ClientProjectGroup[] = [...byClient]
    .map(([clientId, projectIds]) => ({
      key: `client:${clientId}`,
      label: names.get(clientId) ?? clientId,
      clientId,
      projectIds,
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
  if (own.length > 0) {
    groups.push({
      key: OWN_PROJECTS_GROUP_KEY,
      label: OWN_PROJECTS_LABEL,
      projectIds: own,
    });
  }
  return groups;
}
