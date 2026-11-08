import { describe, expect, it } from 'vitest';

import { testEventEmitter, testLocalStorage, testRemoteStorage } from '../testDoubles';

import { CheckSpace } from './CheckSpace';

describe('CheckSpace', () => {
  it('returns local and Drive space with no warnings when the quota has room', async () => {
    const emitter = testEventEmitter();
    const space = await new CheckSpace(
      testRemoteStorage({ space: { driveLimitBytes: 1000, driveFreeBytes: 800 } }),
      testLocalStorage({ free: 500 }),
      emitter,
    ).execute();

    expect(space).toEqual({ localFreeBytes: 500, driveLimitBytes: 1000, driveFreeBytes: 800 });
    expect(emitter.names()).toEqual([]);
  });

  it('emits a space.010 warning without an operation when the quota is close to its limit', async () => {
    const emitter = testEventEmitter();
    await new CheckSpace(
      testRemoteStorage({ space: { driveLimitBytes: 100, driveFreeBytes: 5 } }),
      testLocalStorage({ free: 500 }),
      emitter,
    ).execute();

    expect(emitter.of('warning')).toEqual([
      { operationId: undefined, code: 'space.010', parameters: { limit: 100, free: 5 } },
    ]);
  });
});
