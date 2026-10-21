import type { Client } from './schemas';

/** An Emdash project, reduced to what can tie it to a client's registered repositories. */
export type MatchableProject = {
  id: string;
  /** The project's repository path on its own host. */
  path: string | null;
  /** Local paths are comparable with the client's absolute paths; SSH paths are not. */
  local: boolean;
  /** The URL of the `origin` remote, when the repository has one. */
  originUrl: string | null;
};

export type ProjectMatch = {
  projectId: string;
  clientId: string;
  clientProjectId: string;
  by: 'path' | 'remote';
};

/**
 * An absolute path with `.` and `..` resolved and no trailing slash. POSIX paths keep their
 * case; Windows drive paths use forward slashes and a lower-case drive letter. Anything that is
 * not absolute, and a bare filesystem root, yields undefined.
 */
export function normalizeAbsolutePath(raw: string): string | undefined {
  const value = raw.trim();
  const windows = /^([A-Za-z]):[\\/]/.exec(value);
  if (!windows && !value.startsWith('/')) return undefined;
  const prefix = windows ? `${windows[1]!.toLowerCase()}:` : '';
  const segments: string[] = [];
  for (const segment of (windows ? value.slice(2) : value).split(/[\\/]+/)) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  if (segments.length === 0) return undefined;
  return `${prefix}/${segments.join('/')}`;
}

const SCHEME_URL = /^([a-z][a-z0-9+.-]*):\/\//i;
const SCP_LIKE = /^(?:[^@/\s]+@)?([^:/\s]{2,}):(?!\/\/)(.+)$/;
const BARE_HOST_PATH = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?\/.+$/i;

/**
 * `host/path` for a git remote URL: scheme, credentials, port, query, trailing slashes and a
 * trailing `.git` are dropped and the host is lower-cased, so the https, ssh and scp-like forms
 * of one repository compare equal. Returns undefined for anything that is not a remote URL.
 */
export function normalizeRemoteUrl(raw: string): string | undefined {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return undefined;
  let authority: string;
  let path: string;
  const scheme = SCHEME_URL.exec(value);
  if (scheme) {
    if (scheme[1]!.toLowerCase() === 'file') return undefined;
    const rest = value.slice(scheme[0].length);
    const slash = rest.indexOf('/');
    if (slash < 0) return undefined;
    authority = rest.slice(0, slash);
    path = rest.slice(slash + 1);
  } else if (BARE_HOST_PATH.test(value)) {
    const slash = value.indexOf('/');
    authority = value.slice(0, slash);
    path = value.slice(slash + 1);
  } else {
    const scp = SCP_LIKE.exec(value);
    if (!scp) return undefined;
    authority = scp[1]!;
    path = scp[2]!;
  }
  const host = authority
    .slice(authority.lastIndexOf('@') + 1)
    .replace(/^(\[[^\]]*\]|[^:]*)(?::\d*)?$/, '$1')
    .toLowerCase();
  const cleanPath = path
    .replace(/[?#].*$/, '')
    .split('/')
    .filter(Boolean)
    .join('/')
    .replace(/\.git$/i, '');
  if (!host || !cleanPath) return undefined;
  return `${host}/${cleanPath}`;
}

function isUnderPath(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

type PathEntry = { root: string; clientId: string; clientProjectId: string };
type RemoteEntry = { clientId: string; clientProjectId: string };

/**
 * Ties each project to the client project that registers its repository.
 *
 * A project matches by path when its repository path equals, or is inside, one of the client
 * project's absolute paths (the deepest registered path wins). Otherwise it matches by its
 * `origin` remote against the registered remote URLs. When several clients register the same
 * thing, the earlier client in the list wins.
 */
export function matchProjectsToClients(
  clients: readonly Client[],
  projects: readonly MatchableProject[]
): Map<string, ProjectMatch> {
  const paths: PathEntry[] = [];
  const remotes = new Map<string, RemoteEntry>();
  for (const client of clients) {
    for (const project of client.projects) {
      for (const repo of project.repos) {
        const root = normalizeAbsolutePath(repo);
        if (root) {
          paths.push({
            root,
            clientId: client.id,
            clientProjectId: project.id,
          });
          continue;
        }
        const remote = normalizeRemoteUrl(repo);
        if (remote && !remotes.has(remote)) {
          remotes.set(remote, {
            clientId: client.id,
            clientProjectId: project.id,
          });
        }
      }
    }
  }
  const matches = new Map<string, ProjectMatch>();
  for (const project of projects) {
    const path = project.local && project.path ? normalizeAbsolutePath(project.path) : undefined;
    let best: PathEntry | undefined;
    if (path) {
      for (const entry of paths) {
        if (isUnderPath(path, entry.root) && (!best || entry.root.length > best.root.length)) {
          best = entry;
        }
      }
    }
    if (best) {
      matches.set(project.id, {
        projectId: project.id,
        clientId: best.clientId,
        clientProjectId: best.clientProjectId,
        by: 'path',
      });
      continue;
    }
    const origin = project.originUrl ? normalizeRemoteUrl(project.originUrl) : undefined;
    const remote = origin ? remotes.get(origin) : undefined;
    if (remote) {
      matches.set(project.id, {
        projectId: project.id,
        clientId: remote.clientId,
        clientProjectId: remote.clientProjectId,
        by: 'remote',
      });
    }
  }
  return matches;
}
