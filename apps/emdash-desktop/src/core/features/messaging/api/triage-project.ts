/** The part of a project match the triage needs. */
export type ClientProjectMatch = {
  projectId: string;
  clientId: string;
  clientProjectId: string;
};

/**
 * The open project to run a triage in: one that belongs to the client, preferring the client's
 * own project the conversation is about, then the first by id so the choice is stable.
 */
export function pickTriageProject(
  matches: ReadonlyMap<string, ClientProjectMatch>,
  clientId: string,
  clientProjectId: string
): string | undefined {
  const own = [...matches.values()]
    .filter((match) => match.clientId === clientId)
    .sort((a, b) => a.projectId.localeCompare(b.projectId));
  return (own.find((match) => match.clientProjectId === clientProjectId) ?? own[0])?.projectId;
}

const isLocalPath = (repo: string) => repo.startsWith('/Users/') || repo.startsWith('/Volumes/');

/** Checkouts on this Mac first, then the rest, each group in the order Core registered them. */
export function orderRepos(repos: readonly string[]): string[] {
  return [...repos.filter(isLocalPath), ...repos.filter((repo) => !isLocalPath(repo))];
}
