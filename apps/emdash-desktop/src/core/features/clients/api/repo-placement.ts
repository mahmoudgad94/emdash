import { normalizeAbsolutePath, normalizeRemoteUrl } from './match-projects';
import type { RepoInspection } from './schemas';

/** Where a registered repository lives, as far as this app can tell. */
export type RepoHost =
  | { kind: 'local' }
  | { kind: 'ssh'; connectionId: string; name: string }
  | { kind: 'remote' }
  | { kind: 'missing' };

export type PlacedRepo = {
  repo: string;
  host: RepoHost;
  /** The Emdash project already opened at this repository, when there is one. */
  projectId: string | null;
};

export type RepoGroup = {
  key: string;
  label: string;
  host: RepoHost;
  repos: PlacedRepo[];
};

/** An SSH machine this app can open projects on. */
export type PlacementMachine = { id: string; name: string; username: string };

/** An Emdash project, reduced to what ties it to a registered repository. */
export type PlacementProject = {
  id: string;
  type: 'local' | 'ssh';
  path: string;
  connectionId?: string;
};

export const LOCAL_GROUP_LABEL = 'This Mac';
export const REMOTE_GROUP_LABEL = 'Git remotes';
export const MISSING_GROUP_LABEL = 'Not on this Mac';

function homeOf(machine: PlacementMachine): string {
  return machine.username === 'root' ? '/root' : `/home/${machine.username}`;
}

function under(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/**
 * Sorts a client's registered repositories by where they live: paths that exist on this machine,
 * paths under the home directory of a known SSH machine, git remote URLs, and paths this app
 * cannot reach from here. Each path is tied to the Emdash project already open at it, if any.
 * Groups come in that order, with one group per SSH machine, and empty groups are left out.
 */
export function placeRepos(
  inspections: readonly RepoInspection[],
  machines: readonly PlacementMachine[],
  projects: readonly PlacementProject[]
): RepoGroup[] {
  const local = new Map<string, string>();
  const ssh = new Map<string, Map<string, string>>();
  for (const project of projects) {
    const path = normalizeAbsolutePath(project.path);
    if (path === undefined) continue;
    if (project.type === 'local') local.set(path, project.id);
    else if (project.connectionId !== undefined) {
      const byPath = ssh.get(project.connectionId) ?? new Map<string, string>();
      byPath.set(path, project.id);
      ssh.set(project.connectionId, byPath);
    }
  }

  const groups = new Map<string, RepoGroup>();
  const group = (key: string, label: string, host: RepoHost): RepoGroup => {
    const existing = groups.get(key);
    if (existing) return existing;
    const created = { key, label, host, repos: [] };
    groups.set(key, created);
    return created;
  };
  const seen = new Set<string>();

  for (const inspection of inspections) {
    if (inspection.kind === 'url') {
      const url = normalizeRemoteUrl(inspection.repo) ?? inspection.repo;
      if (seen.has(`url:${url}`)) continue;
      seen.add(`url:${url}`);
      group('remote', REMOTE_GROUP_LABEL, { kind: 'remote' }).repos.push({
        repo: inspection.repo,
        host: { kind: 'remote' },
        projectId: null,
      });
      continue;
    }
    const path = normalizeAbsolutePath(inspection.repo) ?? inspection.repo;
    if (seen.has(`path:${path}`)) continue;
    seen.add(`path:${path}`);
    if (inspection.existsHere) {
      group('local', LOCAL_GROUP_LABEL, { kind: 'local' }).repos.push({
        repo: inspection.repo,
        host: { kind: 'local' },
        projectId: local.get(path) ?? null,
      });
      continue;
    }
    const machine = machines.find((candidate) => under(path, homeOf(candidate)));
    if (machine) {
      const host: RepoHost = {
        kind: 'ssh',
        connectionId: machine.id,
        name: machine.name,
      };
      group(`ssh:${machine.id}`, machine.name, host).repos.push({
        repo: inspection.repo,
        host,
        projectId: ssh.get(machine.id)?.get(path) ?? null,
      });
      continue;
    }
    group('missing', MISSING_GROUP_LABEL, { kind: 'missing' }).repos.push({
      repo: inspection.repo,
      host: { kind: 'missing' },
      projectId: null,
    });
  }

  const order = (entry: RepoGroup): number =>
    entry.host.kind === 'local'
      ? 0
      : entry.host.kind === 'ssh'
        ? 1
        : entry.host.kind === 'remote'
          ? 2
          : 3;
  return [...groups.values()].sort(
    (a, b) => order(a) - order(b) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key)
  );
}

/** The last path segment, for naming a project after its checkout. */
export function repoBasename(repo: string): string {
  const path = normalizeAbsolutePath(repo) ?? repo;
  return path.split('/').filter(Boolean).at(-1) ?? repo;
}
