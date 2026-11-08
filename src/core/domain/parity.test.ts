import { describe, expect, it } from 'vitest';

import fixture from '../../../tests/fixtures/rules.json';

import { ErrorBackup } from './errors';
import { validateMetadata } from './metadata';
import { shouldEmitProgress } from './progress';
import { hasEnoughSpace, quotaNearLimit } from './space';

interface MetadataCase {
  description: string;
  metadata?: Record<string, string | { character: string; times: number }>;
  properties?: number;
  expected: string | null;
}

/** Same expansion rules as the Kotlin test. */
function build(testCase: MetadataCase): Record<string, string> {
  if (testCase.properties !== undefined) {
    return Object.fromEntries(Array.from({ length: testCase.properties }, (_, i) => [`k${i}`, 'v']));
  }
  return Object.fromEntries(
    Object.entries(testCase.metadata ?? {}).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : value.character.repeat(value.times),
    ]),
  );
}

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof ErrorBackup ? error.code : 'other';
  }
}

describe('parity with Kotlin (tests/fixtures/rules.json)', () => {
  it('hasEnoughSpace', () => {
    for (const c of fixture.hasEnoughSpace) {
      expect(hasEnoughSpace(c.free, c.needed, c.margin), JSON.stringify(c)).toBe(c.expected);
    }
  });

  it('quotaNearLimit', () => {
    for (const c of fixture.quotaNearLimit) {
      expect(quotaNearLimit(c.limit, c.free), JSON.stringify(c)).toBe(c.expected);
    }
  });

  it('shouldEmitProgress', () => {
    for (const c of fixture.shouldEmitProgress) {
      expect(shouldEmitProgress(c.last ?? undefined, c.now), JSON.stringify(c)).toBe(c.expected);
    }
  });

  it('validateMetadata', () => {
    for (const c of fixture.validateMetadata as MetadataCase[]) {
      expect(
        codeOf(() => validateMetadata(build(c))),
        c.description,
      ).toBe(c.expected);
    }
  });
});
