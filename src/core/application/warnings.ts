import { quotaNearLimit } from '../domain/space';

import type { WarningEvent } from './events';
import type { DriveSpace } from './ports/IRemoteStorage';

/** `space.010` warning if the Drive quota is close to its limit. `undefined` if not needed. */
export function quotaWarning(space: DriveSpace, operationId?: string): WarningEvent | undefined {
  const { driveLimitBytes: limit, driveFreeBytes: free } = space;
  if (limit === undefined || free === undefined || !quotaNearLimit(limit, free)) return undefined;
  return {
    operationId,
    code: 'space.010',
    parameters: { limit, free },
  };
}
