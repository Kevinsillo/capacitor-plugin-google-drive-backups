import { ErrorBackup } from '../../domain/errors';
import { validateMetadata } from '../../domain/metadata';
import type { OperationPhase, RemoteBackup } from '../../domain/models';
import { DRIVE_SPACE_MARGIN, hasEnoughSpace } from '../../domain/space';
import { closeWithError } from '../operationError';
import type { IEventEmitter } from '../ports/IEventEmitter';
import type { ILocalStorage } from '../ports/ILocalStorage';
import type { IRemoteStorage } from '../ports/IRemoteStorage';
import { quotaWarning } from '../warnings';

export interface UploadBackupInput {
  path: string;
  name: string;
  metadata: Record<string, string>;
  operationId: string;
  signal?: AbortSignal;
}

/**
 * Uploads a local file to Drive. Order: validate, check space, read, upload, verify size.
 * Each step emits its phase; any failure emits `error` before throwing.
 */
export class UploadBackup {
  constructor(
    private readonly remote: IRemoteStorage,
    private readonly local: ILocalStorage,
    private readonly emitter: IEventEmitter,
  ) {}

  async execute(input: UploadBackupInput): Promise<RemoteBackup & { operationId: string }> {
    const { operationId, signal } = input;
    const phase = (value: OperationPhase) => this.emitter.emit('state', { operationId, phase: value });

    try {
      phase('preparing');
      validateMetadata(input.metadata);

      phase('checking-space');
      const size = await this.local.size(input.path);
      if (size === 0) throw new ErrorBackup('file.003', { path: input.path });

      const space = await this.remote.space(signal);
      const warning = quotaWarning(space, operationId);
      if (warning) this.emitter.emit('warning', warning);
      if (space.driveFreeBytes !== undefined && !hasEnoughSpace(space.driveFreeBytes, size, DRIVE_SPACE_MARGIN)) {
        throw new ErrorBackup('space.002', { needed: size, free: space.driveFreeBytes });
      }

      phase('uploading');
      const content = await this.local.read(input.path);
      const backup = await this.remote.upload({ name: input.name, content, metadata: input.metadata }, signal);

      phase('verifying');
      if (backup.bytes !== size) {
        throw new ErrorBackup('drive.001', { reason: 'size-mismatch', sent: size, received: backup.bytes });
      }

      phase('done');
      return { ...backup, operationId };
    } catch (error) {
      throw closeWithError(this.emitter, operationId, error, signal?.aborted === true);
    }
  }
}
