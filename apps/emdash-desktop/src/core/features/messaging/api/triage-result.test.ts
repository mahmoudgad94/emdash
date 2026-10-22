import { describe, expect, it } from 'vitest';
import { triageMarker } from './triage-prompt';
import { readTriage, triageTypeLabel } from './triage-result';

const block =
  'CLIENT_OPS_RESULT\n{"type":"NEW_TASK","project":"/p","first":"Create the milestone","draft":"On it, I will set up the milestone first.","next":"Create milestone"}\nEND_CLIENT_OPS_RESULT';

describe('readTriage', () => {
  const prompt = { role: 'user' as const, text: `${triageMarker('cv1')}\nYou are helping me` };

  it('does not find a session that was not started for this conversation', () => {
    expect(readTriage('cv1', [{ role: 'user', text: 'something else' }])).toEqual({ found: false });
    expect(readTriage('cv2', [prompt])).toEqual({ found: false });
  });

  it('recognises the session before Claude has answered', () => {
    expect(readTriage('cv1', [prompt, { role: 'assistant', text: 'Looking at the repo' }])).toEqual(
      {
        found: true,
      }
    );
  });

  it('reads the result from what Claude said after the prompt, across several messages', () => {
    const read = readTriage('cv1', [
      prompt,
      { role: 'assistant', text: 'Checked the repo.' },
      { role: 'tool', text: 'ls' },
      { role: 'assistant', text: `Here is my answer.\n${block}` },
    ]);
    expect(read.found).toBe(true);
    expect(read.result).toMatchObject({ type: 'NEW_TASK', first: 'Create the milestone' });
  });

  it('ignores a result block that appears before the prompt', () => {
    const read = readTriage('cv1', [{ role: 'assistant', text: block }, prompt]);
    expect(read).toEqual({ found: true });
  });
});

describe('triageTypeLabel', () => {
  it('speaks plainly', () => {
    expect(triageTypeLabel('WAITING_ON_CLIENT')).toBe('Waiting on the client');
  });
});
