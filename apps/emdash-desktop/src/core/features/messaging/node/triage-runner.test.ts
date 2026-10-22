import { describe, expect, it } from 'vitest';
import { findClaude, parseClaudeJson, triageArgs } from './triage-runner';

describe('triageArgs', () => {
  it('runs light and read-only: project settings only, no MCP, no commands, read tools only', () => {
    const args = triageArgs();
    expect(args).toEqual(
      expect.arrayContaining(['-p', '--strict-mcp-config', '--disable-slash-commands'])
    );
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('project');
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('Read,Glob,Grep');
    expect(args[args.indexOf('--disallowedTools') + 1]).toContain('Bash');
    expect(args[args.indexOf('--disallowedTools') + 1]).toContain('Write');
  });
});

describe('parseClaudeJson', () => {
  it('returns the answer of a successful run and nothing for a failed or broken one', () => {
    expect(parseClaudeJson('{"type":"result","result":"Done","is_error":false}')).toBe('Done');
    expect(parseClaudeJson('{"type":"result","result":"x","is_error":true}')).toBeUndefined();
    expect(parseClaudeJson('not json')).toBeUndefined();
  });
});

describe('findClaude', () => {
  it("looks on PATH first, then the installer's folder", () => {
    expect(findClaude({ PATH: '/a:/b' }, '/h', (p) => p === '/b/claude')).toBe('/b/claude');
    expect(findClaude({ PATH: '' }, '/h', (p) => p === '/h/.local/bin/claude')).toBe(
      '/h/.local/bin/claude'
    );
    expect(findClaude({ PATH: '' }, '/h', () => false)).toBeUndefined();
  });
});
