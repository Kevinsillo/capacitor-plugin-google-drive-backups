import { describe, expect, it } from 'vitest';

import fixture from '../../../../tests/fixtures/drive-errors.json';

import { isRetryable, translateDriveError } from './driveError';

describe('Drive error mapping parity (tests/fixtures/drive-errors.json)', () => {
  it.each(fixture.cases)('status $status reason $reason maps to $code', (c) => {
    const reason = c.reason ?? undefined;
    expect(translateDriveError(c.status, reason).code).toBe(c.code);
    expect(isRetryable(c.status, reason)).toBe(c.retryable);
  });
});
