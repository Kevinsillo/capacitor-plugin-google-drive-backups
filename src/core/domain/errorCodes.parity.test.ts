import { describe, expect, it } from 'vitest';

import fixture from '../../../tests/fixtures/error-codes.json';

import { ERROR_CODES, type ErrorCode } from './errors';

describe('error catalog parity (tests/fixtures/error-codes.json)', () => {
  const expected: Record<string, boolean> = fixture.codes;

  it('has the same codes as the Kotlin catalog', () => {
    expect(Object.keys(ERROR_CODES).sort()).toEqual(Object.keys(expected).sort());
  });

  it.each(Object.keys(expected))('%s has the same recoverable flag in both catalogs', (code) => {
    expect(ERROR_CODES[code as ErrorCode].recoverable).toBe(expected[code]);
  });
});
