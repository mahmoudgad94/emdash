import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';

/** How long one background triage may take before it is stopped. */
const RUN_TIMEOUT_MS = 6 * 60_000;
const MAX_PROMPT = 60_000;
const MAX_OUTPUT = 2_000_000;

/**
 * The arguments for a light, read-only Claude Code run: a smaller model, only the project's own
 * settings (none of the owner's global hooks, skills or MCP servers), no slash commands, and only
 * the tools that read files. The prompt goes in on stdin.
 */
export function triageArgs(model = 'sonnet'): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--model',
    model,
    '--setting-sources',
    'project',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--allowedTools',
    'Read,Glob,Grep',
    '--disallowedTools',
    'Bash,Edit,Write,MultiEdit,NotebookEdit,WebFetch,WebSearch,Task',
  ];
}

/** The final answer text from `--output-format json`, or undefined when the run failed. */
export function parseClaudeJson(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout.trim()) as { result?: unknown; is_error?: unknown };
    if (parsed.is_error === true || typeof parsed.result !== 'string') return undefined;
    return parsed.result;
  } catch {
    return undefined;
  }
}

/** The Claude Code binary: on PATH, else the places its installer and Homebrew use. */
export function findClaude(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  exists: (path: string) => boolean = existsSync
): string | undefined {
  const dirs = [
    ...(env.PATH ?? '').split(delimiter),
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ].filter(Boolean);
  for (const dir of dirs) {
    const candidate = join(dir, 'claude');
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

export type TriageRunError = { code: string; message: string };
export type RunTriage = (input: {
  cwd: string;
  prompt: string;
}) => Promise<{ success: true; text: string } | { success: false; error: TriageRunError }>;

/** Runs Claude Code once in the project folder, read-only, and returns its answer. */
export const runTriage: RunTriage = async ({ cwd, prompt }) => {
  if (!isAbsolute(cwd) || !existsSync(cwd) || !statSync(cwd).isDirectory())
    return { success: false, error: { code: 'invalid_input', message: 'Not a project folder' } };
  if (prompt.length === 0 || prompt.length > MAX_PROMPT)
    return {
      success: false,
      error: { code: 'invalid_input', message: 'Prompt is empty or too long' },
    };
  const binary = findClaude();
  if (!binary)
    return {
      success: false,
      error: { code: 'not_found', message: 'Claude Code is not installed' },
    };

  return await new Promise((resolve) => {
    const child = spawn(binary, triageArgs(), { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let settled = false;
    const finish = (value: Awaited<ReturnType<RunTriage>>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ success: false, error: { code: 'timeout', message: 'Claude took too long' } });
    }, RUN_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk.toString('utf8');
    });
    child.stderr.resume();
    child.on('error', () =>
      finish({ success: false, error: { code: 'failed', message: 'Claude Code could not start' } })
    );
    child.on('close', () => {
      const text = parseClaudeJson(stdout);
      finish(
        text === undefined
          ? { success: false, error: { code: 'failed', message: 'Claude Code did not answer' } }
          : { success: true, text }
      );
    });
    child.stdin.end(prompt);
  });
};
