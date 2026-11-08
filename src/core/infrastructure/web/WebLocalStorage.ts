import type { ILocalStorage } from '../../application/ports/ILocalStorage';
import { ErrorBackup } from '../../domain/errors';

/**
 * Local storage for the browser. It can estimate the free space, but it has no file system:
 * the plugin's upload and download work with device paths, which a browser does not have.
 * File operations therefore reject with `platform.001` and the reason `no-file-system`.
 */
export class WebLocalStorage implements ILocalStorage {
  async freeSpace(): Promise<number> {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota === undefined || estimate.usage === undefined) return 0;
    return Math.max(estimate.quota - estimate.usage, 0);
  }

  async size(): Promise<number> {
    throw noFileSystem();
  }

  async read(): Promise<Blob> {
    throw noFileSystem();
  }

  async write(): Promise<void> {
    throw noFileSystem();
  }
}

function noFileSystem(): ErrorBackup {
  return new ErrorBackup('platform.001', { platform: 'web', reason: 'no-file-system' });
}
