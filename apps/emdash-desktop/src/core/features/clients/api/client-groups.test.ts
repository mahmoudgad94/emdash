import { describe, expect, it } from 'vitest';
import { groupProjectsByClient } from './client-groups';
import type { ProjectMatch } from './match-projects';
import type { Client } from './schemas';

const clients: Client[] = [
  { id: 'c-b', name: 'Beta Studio', agreement: 'retainer', projects: [] },
  { id: 'c-a', name: 'acme', agreement: 'per_task', projects: [] },
  { id: 'c-z', name: 'Zed', agreement: null, projects: [] },
];

const match = (projectId: string, clientId: string): [string, ProjectMatch] => [
  projectId,
  { projectId, clientId, clientProjectId: `${clientId}-p`, by: 'path' },
];

describe('groupProjectsByClient', () => {
  it('returns nothing to group when no project belongs to a client', () => {
    expect(groupProjectsByClient(['p1', 'p2'], new Map(), clients)).toBeUndefined();
    expect(groupProjectsByClient([], new Map(), clients)).toBeUndefined();
  });

  it('groups by client name, keeps input order inside a group and puts the rest under "Your projects"', () => {
    const groups = groupProjectsByClient(
      ['p1', 'p2', 'p3', 'p4', 'p5'],
      new Map([match('p1', 'c-b'), match('p3', 'c-a'), match('p4', 'c-b')]),
      clients
    );
    expect(groups).toEqual([
      { key: 'client:c-a', label: 'acme', clientId: 'c-a', projectIds: ['p3'] },
      { key: 'client:c-b', label: 'Beta Studio', clientId: 'c-b', projectIds: ['p1', 'p4'] },
      { key: 'own', label: 'Your projects', projectIds: ['p2', 'p5'] },
    ]);
  });

  it('omits clients without projects and "Your projects" when everything is matched', () => {
    const groups = groupProjectsByClient(['p1'], new Map([match('p1', 'c-z')]), clients);
    expect(groups?.map((group) => group.label)).toEqual(['Zed']);
  });

  it('treats a match for an unknown client as unmatched', () => {
    const groups = groupProjectsByClient(
      ['p1', 'p2'],
      new Map([match('p1', 'c-z'), match('p2', 'gone')]),
      clients
    );
    expect(groups?.at(-1)).toMatchObject({ key: 'own', projectIds: ['p2'] });
  });
});
