import { describe, expect, it } from 'vitest';
import { orderRepos, pickTriageProject } from './triage-project';

const match = (projectId: string, clientId: string, clientProjectId: string) =>
  [projectId, { projectId, clientId, clientProjectId }] as const;

describe('pickTriageProject', () => {
  const matches = new Map([
    match('p2', 'c1', 'cp-b'),
    match('p1', 'c1', 'cp-a'),
    match('p9', 'c2', 'cp-z'),
  ]);

  it('prefers the project of the client project the conversation is about', () => {
    expect(pickTriageProject(matches, 'c1', 'cp-b')).toBe('p2');
  });

  it("falls back to the client's first project by id, never another client's", () => {
    expect(pickTriageProject(matches, 'c1', 'unknown')).toBe('p1');
    expect(pickTriageProject(matches, 'c3', 'cp-a')).toBeUndefined();
  });
});

describe('orderRepos', () => {
  it('puts checkouts on this Mac first and keeps each group in order', () => {
    expect(
      orderRepos(['/home/me/a', 'https://github.com/x/y.git', '/Users/me/b', '/Volumes/SSD/c'])
    ).toEqual(['/Users/me/b', '/Volumes/SSD/c', '/home/me/a', 'https://github.com/x/y.git']);
  });
});
