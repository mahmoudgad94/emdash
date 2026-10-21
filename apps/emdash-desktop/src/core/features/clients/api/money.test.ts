import { describe, expect, it } from 'vitest';
import { formatMinor } from './money';

describe('formatMinor', () => {
  it('formats minor units in the currency', () => {
    expect(formatMinor(320000, 'USD')).toBe('$3,200.00');
    expect(formatMinor(-36340, 'USD')).toBe('-$363.40');
  });

  it('falls back to a plain amount without or with an unknown currency', () => {
    expect(formatMinor(1050, null)).toBe('10.50');
    expect(formatMinor(1050, 'ZZZZ')).toBe('10.50 ZZZZ');
  });
});
