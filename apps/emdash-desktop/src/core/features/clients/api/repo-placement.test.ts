import { describe, expect, it } from 'vitest';
import { placeRepos, repoBasename } from './repo-placement';
import type { RepoInspection } from './schemas';

const path = (repo: string, existsHere: boolean): RepoInspection => ({
  repo,
  kind: 'path',
  existsHere,
});
const url = (repo: string): RepoInspection => ({
  repo,
  kind: 'url',
  existsHere: false,
});

const devserver = { id: 'm1', name: 'devserver', username: 'zerogad' };

describe('placeRepos', () => {
  it('groups paths on this machine, on a known SSH machine, remotes and unreachable paths in that order', () => {
    const groups = placeRepos(
      [
        path('/home/zerogad/projects/api', false),
        url('https://github.com/acme/api.git'),
        path('/Users/me/old/api', false),
        path('/Volumes/SSD/work/api', true),
      ],
      [devserver],
      []
    );
    expect(groups.map((group) => [group.label, group.repos.map((repo) => repo.repo)])).toEqual([
      ['This Mac', ['/Volumes/SSD/work/api']],
      ['devserver', ['/home/zerogad/projects/api']],
      ['Git remotes', ['https://github.com/acme/api.git']],
      ['Not on this Mac', ['/Users/me/old/api']],
    ]);
    expect(groups[1]!.host).toEqual({
      kind: 'ssh',
      connectionId: 'm1',
      name: 'devserver',
    });
  });

  it('ties a repository to the Emdash project already open at it, per host', () => {
    const groups = placeRepos(
      [path('/Volumes/SSD/work/api/', true), path('/home/zerogad/projects/api', false)],
      [devserver],
      [
        { id: 'p-local', type: 'local', path: '/Volumes/SSD/work/api' },
        {
          id: 'p-ssh',
          type: 'ssh',
          path: '/home/zerogad/projects/api',
          connectionId: 'm1',
        },
        {
          id: 'p-other',
          type: 'ssh',
          path: '/home/zerogad/projects/api',
          connectionId: 'm2',
        },
      ]
    );
    expect(groups[0]!.repos[0]!.projectId).toBe('p-local');
    expect(groups[1]!.repos[0]!.projectId).toBe('p-ssh');
  });

  it('drops repositories that only differ in form', () => {
    const groups = placeRepos(
      [
        url('git@github.com:acme/api.git'),
        url('https://github.com/acme/api'),
        path('/home/zerogad/projects/api', false),
        path('/home/zerogad/projects/api/', false),
      ],
      [devserver],
      []
    );
    expect(groups.map((group) => group.repos.length)).toEqual([1, 1]);
  });

  it('treats a root user home as /root and leaves out empty groups', () => {
    const groups = placeRepos(
      [path('/root/app', false)],
      [{ id: 'm', name: 'box', username: 'root' }],
      []
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('box');
  });

  it('returns nothing for no repositories', () => {
    expect(placeRepos([], [devserver], [])).toEqual([]);
  });
});

describe('repoBasename', () => {
  it('names a project after the last path segment', () => {
    expect(repoBasename('/home/zerogad/projects/api/')).toBe('api');
    expect(repoBasename('/Volumes/SSD/work/George')).toBe('George');
  });
});
