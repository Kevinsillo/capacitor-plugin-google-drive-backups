import { describe, expect, it } from 'vitest';

import { PROGRESS_INTERVAL_MS, shouldEmitProgress } from './progress';
import { LOCAL_SPACE_MARGIN, hasEnoughSpace, quotaNearLimit } from './space';

describe('hasEnoughSpace', () => {
  it('with margin 1, the free space must equal the needed amount', () => {
    expect(hasEnoughSpace(100, 100, 1)).toBe(true);
    expect(hasEnoughSpace(99, 100, 1)).toBe(false);
  });

  it('with the local margin, requires 10 % more', () => {
    expect(hasEnoughSpace(110, 100, LOCAL_SPACE_MARGIN)).toBe(true);
    expect(hasEnoughSpace(109, 100, LOCAL_SPACE_MARGIN)).toBe(false);
  });
});

describe('quotaNearLimit', () => {
  it('warns from 90 % used', () => {
    expect(quotaNearLimit(1000, 100)).toBe(true); // 90 % used
    expect(quotaNearLimit(1000, 101)).toBe(false); // 89.9 % used
  });

  it('does not warn without a known limit', () => {
    expect(quotaNearLimit(0, 0)).toBe(false);
  });

  it('never goes negative when free space exceeds the limit', () => {
    expect(quotaNearLimit(100, 500)).toBe(false);
  });
});

describe('shouldEmitProgress', () => {
  it('always emits the first time', () => {
    expect(shouldEmitProgress(undefined, 0)).toBe(true);
  });

  it(`respects the ${PROGRESS_INTERVAL_MS} ms interval`, () => {
    expect(shouldEmitProgress(1000, 1000 + PROGRESS_INTERVAL_MS - 1)).toBe(false);
    expect(shouldEmitProgress(1000, 1000 + PROGRESS_INTERVAL_MS)).toBe(true);
  });
});
