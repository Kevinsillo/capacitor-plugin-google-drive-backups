import type { SpaceInfo } from '../../domain/models';
import type { IEventEmitter } from '../ports/IEventEmitter';
import type { ILocalStorage } from '../ports/ILocalStorage';
import type { IRemoteStorage } from '../ports/IRemoteStorage';
import { quotaWarning } from '../warnings';

/** Free space on the device and in Drive. Emits a `space.010` warning without an operation if the quota is close. */
export class CheckSpace {
  constructor(
    private readonly remote: IRemoteStorage,
    private readonly local: ILocalStorage,
    private readonly emitter: IEventEmitter,
  ) {}

  async execute(signal?: AbortSignal): Promise<SpaceInfo> {
    const localFreeBytes = await this.local.freeSpace();
    const drive = await this.remote.space(signal);

    const warning = quotaWarning(drive);
    if (warning) this.emitter.emit('warning', warning);

    return { localFreeBytes, ...drive };
  }
}
