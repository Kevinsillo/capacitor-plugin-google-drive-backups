import { ErrorBackup } from '../domain/errors';

import type { IEventEmitter } from './ports/IEventEmitter';

/** Every failure becomes an `ErrorBackup`; anything that is not ours is marked `drive.001`. */
export function toErrorBackup(error: unknown): ErrorBackup {
  if (error instanceof ErrorBackup) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new ErrorBackup('drive.001', { reason: 'unexpected' }, message);
}

/**
 * Closes a failed operation: emits `state: cancelled` if it was a cancellation, then `error`,
 * and returns the error the use case must throw.
 */
export function closeWithError(
  emitter: IEventEmitter,
  operationId: string,
  error: unknown,
  cancelled: boolean,
): ErrorBackup {
  const errorBackup = cancelled ? new ErrorBackup('operation.001') : toErrorBackup(error);

  if (cancelled) emitter.emit('state', { operationId, phase: 'cancelled' });
  emitter.emit('error', {
    operationId,
    code: errorBackup.code,
    parameters: errorBackup.parameters,
    message: errorBackup.message,
    recoverable: errorBackup.recoverable,
  });
  return errorBackup;
}
