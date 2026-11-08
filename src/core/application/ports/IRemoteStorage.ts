import type { RemoteBackup, SpaceInfo } from '../../domain/models';

/** Drive space. The device's local space is measured by the plugin on the device, not by Drive. */
export type DriveSpace = Omit<SpaceInfo, 'localFreeBytes'>;

/** What the application hands over for upload. The content is opaque to the storage. */
export interface RemoteUpload {
  name: string;
  content: Blob;
  metadata: Record<string, string>;
  /** Optional: called with bytes sent so far. Only available where the transport reports upload progress. */
  onProgress?: (bytes: number, total: number) => void;
}

/**
 * Port for remote storage. The Drive implementation lives in infrastructure; use cases only see
 * this interface. Every operation accepts an `AbortSignal`.
 */
export interface IRemoteStorage {
  space(signal?: AbortSignal): Promise<DriveSpace>;
  upload(input: RemoteUpload, signal?: AbortSignal): Promise<RemoteBackup>;
  /** Backups ordered by creation date, newest first. */
  list(signal?: AbortSignal): Promise<RemoteBackup[]>;
  download(id: string, signal?: AbortSignal): Promise<Blob>;
  delete(id: string, signal?: AbortSignal): Promise<void>;
}
