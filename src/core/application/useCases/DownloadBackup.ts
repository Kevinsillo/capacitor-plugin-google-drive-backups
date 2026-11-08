import { ErrorBackup } from '../../domain/errors';
import type { OperationPhase, RemoteBackup } from '../../domain/models';
import { hasEnoughSpace, LOCAL_SPACE_MARGIN } from '../../domain/space';
import { closeWithError } from '../operationError';
import type { IEventEmitter } from '../ports/IEventEmitter';
import type { ILocalStorage } from '../ports/ILocalStorage';
import type { IRemoteStorage } from '../ports/IRemoteStorage';

export interface DownloadBackupInput {
  backup: RemoteBackup;
  destination: string;
  operationId: string;
  signal?: AbortSignal;
}

/**
 * Downloads a backup to a local file. Checks local space first, using the size Drive reported when
 * listing, and verifies the received size before writing to the destination.
 */
export class DownloadBackup {
  constructor(
    private readonly remote: IRemoteStorage,
    private readonly local: ILocalStorage,
    private readonly emitter: IEventEmitter,
  ) {}

  async execute(input: DownloadBackupInput): Promise<{ operationId: string; path: string; bytes: number }> {
    const { operationId, signal, backup } = input;
    const phase = (value: OperationPhase) => this.emitter.emit('state', { operationId, phase: value });

    try {
      phase('preparing');
      phase('checking-space');
      const free = await this.local.freeSpace();
      if (!hasEnoughSpace(free, backup.bytes, LOCAL_SPACE_MARGIN)) {
        throw new ErrorBackup('space.001', { needed: backup.bytes, free });
      }

      phase('downloading');
      const content = await this.remote.download(backup.id, signal);

      phase('verifying');
      if (content.size !== backup.bytes) {
        throw new ErrorBackup('drive.001', {
          reason: 'size-mismatch',
          expected: backup.bytes,
          received: content.size,
        });
      }

      await this.local.write(input.destination, content);
      phase('done');
      return { operationId, path: input.destination, bytes: content.size };
    } catch (error) {
      throw closeWithError(this.emitter, operationId, error, signal?.aborted === true);
    }
  }
}
