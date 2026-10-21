import { describe, expect, it } from 'vitest';
import {
  matchProjectsToClients,
  normalizeAbsolutePath,
  normalizeRemoteUrl,
  type MatchableProject,
} from './match-projects';
import type { Client } from './schemas';

describe('normalizeAbsolutePath', () => {
  it('resolves dots and trims trailing slashes', () => {
    expect(normalizeAbsolutePath('/Users/me/work/acme/')).toBe('/Users/me/work/acme');
    expect(normalizeAbsolutePath('/Users//me/./work/../work/acme')).toBe('/Users/me/work/acme');
    expect(normalizeAbsolutePath('/Volumes/MG ExternalSSD/Dev/app')).toBe(
      '/Volumes/MG ExternalSSD/Dev/app'
    );
  });

  it('accepts Windows drive paths and compares the drive letter case-insensitively', () => {
    expect(normalizeAbsolutePath('C:\\Users\\me\\acme\\')).toBe('c:/Users/me/acme');
    expect(normalizeAbsolutePath('c:/Users/me/acme')).toBe('c:/Users/me/acme');
  });

  it('rejects relative paths, remote URLs and a bare root', () => {
    expect(normalizeAbsolutePath('acme/site')).toBeUndefined();
    expect(normalizeAbsolutePath('~/work/acme')).toBeUndefined();
    expect(normalizeAbsolutePath('https://github.com/acme/site.git')).toBeUndefined();
    expect(normalizeAbsolutePath('/')).toBeUndefined();
    expect(normalizeAbsolutePath('')).toBeUndefined();
  });
});

describe('normalizeRemoteUrl', () => {
  it('makes the https, ssh and scp-like forms of one repository identical', () => {
    const forms = [
      'https://github.com/acme/site.git',
      'https://github.com/acme/site',
      'https://github.com/acme/site/',
      'http://github.com/acme/site.git',
      'git@github.com:acme/site.git',
      'ssh://git@github.com/acme/site.git',
      'ssh://git@github.com:22/acme/site.git',
      'git+ssh://git@github.com/acme/site.git',
      'git://github.com/acme/site.git',
      'github.com/acme/site',
    ];
    for (const form of forms) expect(normalizeRemoteUrl(form), form).toBe('github.com/acme/site');
  });

  it('strips credentials, ports, query strings and fragments, and lower-cases only the host', () => {
    expect(normalizeRemoteUrl('https://user:secret@GitHub.COM/Acme/Site.git')).toBe(
      'github.com/Acme/Site'
    );
    expect(normalizeRemoteUrl('https://token@git.example.com:8443/team/app.git?ref=x#frag')).toBe(
      'git.example.com/team/app'
    );
    expect(normalizeRemoteUrl('https://[::1]:8443/team/app.git')).toBe('[::1]/team/app');
    expect(normalizeRemoteUrl('git@gitlab.com:group/sub/app.git')).toBe('gitlab.com/group/sub/app');
  });

  it('keeps differently named repositories apart', () => {
    expect(normalizeRemoteUrl('https://github.com/acme/site-2.git')).not.toBe(
      normalizeRemoteUrl('https://github.com/acme/site.git')
    );
    expect(normalizeRemoteUrl('https://gitlab.com/acme/site.git')).not.toBe(
      normalizeRemoteUrl('https://github.com/acme/site.git')
    );
  });

  it('rejects paths, file URLs, hosts without a path and free text', () => {
    expect(normalizeRemoteUrl('/Users/me/work/acme')).toBeUndefined();
    expect(normalizeRemoteUrl('C:\\work\\acme')).toBeUndefined();
    expect(normalizeRemoteUrl('file:///Users/me/work/acme')).toBeUndefined();
    expect(normalizeRemoteUrl('https://github.com')).toBeUndefined();
    expect(normalizeRemoteUrl('my notes about the repo')).toBeUndefined();
    expect(normalizeRemoteUrl('')).toBeUndefined();
  });
});

const client = (id: string, repos: string[][]): Client => ({
  id,
  name: id,
  agreement: null,
  projects: repos.map((r, index) => ({ id: `${id}-p${index}`, name: `${id} ${index}`, repos: r })),
});

const project = (
  id: string,
  path: string | null,
  originUrl: string | null = null,
  local = true
): MatchableProject => ({ id, path, local, originUrl });

describe('matchProjectsToClients', () => {
  const clients = [
    client('acme', [
      ['/Users/me/work/acme/site', 'https://github.com/acme/site.git'],
      ['/Users/me/work/acme/api'],
    ]),
    client('globex', [['/Users/me/work/globex', 'git@gitlab.com:globex/app.git']]),
  ];

  it('matches a project whose path equals a registered path', () => {
    const matches = matchProjectsToClients(clients, [project('a', '/Users/me/work/acme/site')]);
    expect(matches.get('a')).toEqual({
      projectId: 'a',
      clientId: 'acme',
      clientProjectId: 'acme-p0',
      by: 'path',
    });
  });

  it('matches a project inside a registered path, ignoring slashes and dots', () => {
    const matches = matchProjectsToClients(clients, [
      project('a', '/Users/me/work/globex/packages/web/'),
      project('b', '/Users/me/work/./acme/api/../api/'),
    ]);
    expect(matches.get('a')).toMatchObject({ clientId: 'globex', by: 'path' });
    expect(matches.get('b')).toMatchObject({ clientId: 'acme', clientProjectId: 'acme-p1' });
  });

  it('does not match siblings that merely share a name prefix, nor parents of a registered path', () => {
    const matches = matchProjectsToClients(clients, [
      project('prefix', '/Users/me/work/acme/site-old'),
      project('parent', '/Users/me/work/acme'),
      project('elsewhere', '/Users/me/other/acme/site'),
    ]);
    expect(matches.size).toBe(0);
  });

  it('prefers the deepest registered path over a broader one', () => {
    const nested = [client('broad', [['/work']]), client('narrow', [['/work/acme/site']])];
    const matches = matchProjectsToClients(nested, [project('a', '/work/acme/site/app')]);
    expect(matches.get('a')?.clientId).toBe('narrow');
  });

  it('falls back to the origin remote, in any URL form', () => {
    const matches = matchProjectsToClients(clients, [
      project('a', '/Users/me/dev/site', 'git@github.com:acme/site.git'),
      project('b', '/Users/me/dev/app', 'https://user:pw@GitLab.com/globex/app'),
      project('c', '/Users/me/dev/misc', 'https://github.com/someone/else.git'),
      project('d', '/Users/me/dev/none', null),
    ]);
    expect(matches.get('a')).toMatchObject({ clientId: 'acme', by: 'remote' });
    expect(matches.get('b')).toMatchObject({ clientId: 'globex', by: 'remote' });
    expect(matches.has('c')).toBe(false);
    expect(matches.has('d')).toBe(false);
  });

  it('prefers a path match over a remote match', () => {
    const matches = matchProjectsToClients(clients, [
      project('a', '/Users/me/work/globex', 'https://github.com/acme/site.git'),
    ]);
    expect(matches.get('a')).toMatchObject({ clientId: 'globex', by: 'path' });
  });

  it('ignores paths of SSH projects but still matches their remote', () => {
    const matches = matchProjectsToClients(clients, [
      project('ssh-path', '/Users/me/work/acme/site', null, false),
      project('ssh-remote', '/srv/site', 'https://github.com/acme/site.git', false),
    ]);
    expect(matches.has('ssh-path')).toBe(false);
    expect(matches.get('ssh-remote')).toMatchObject({ clientId: 'acme', by: 'remote' });
  });

  it('gives a repository registered twice to the earlier client', () => {
    const duplicated = [
      client('first', [['https://github.com/shared/repo.git']]),
      client('second', [['git@github.com:shared/repo.git'], ['/x/y']]),
    ];
    const matches = matchProjectsToClients(duplicated, [
      project('a', '/p', 'https://github.com/shared/repo'),
    ]);
    expect(matches.get('a')?.clientId).toBe('first');
  });

  it('ignores relative paths, a root path and free text in the registered repositories', () => {
    const odd = [client('odd', [['relative/dir', '/', 'see the wiki', '']])];
    expect(matchProjectsToClients(odd, [project('a', '/anything')]).size).toBe(0);
  });
});
