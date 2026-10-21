import { describe, expect, it } from 'vitest';
import { activeClients, hiddenClientCount } from './active-clients';

const clients = [
  { id: 'a', status: 'active' as const },
  { id: 'b', status: 'inactive' as const },
  { id: 'c', status: 'active' as const },
];

describe('activeClients', () => {
  it('keeps active clients in order and counts the rest', () => {
    expect(activeClients(clients).map((c) => c.id)).toEqual(['a', 'c']);
    expect(hiddenClientCount(clients)).toBe(1);
  });
});
