/** Values the plugin can send to the developer in errors, warnings and events. */
export type Parameters = Record<string, string | number | boolean>;

/** Detail level of `log` events. */
export type LogLevel = 'silent' | 'info' | 'debug';

/** Phase a long-running operation is in. Emitted as a `state` event. */
export type OperationPhase =
  'preparing' | 'checking-space' | 'compressing' | 'uploading' | 'downloading' | 'verifying' | 'done' | 'cancelled';

/** Backup stored in Google Drive. */
export interface RemoteBackup {
  id: string;
  name: string;
  bytes: number;
  /** Creation date in ISO 8601 (UTC), assigned by Drive. */
  createdAt: string;
  /** Metadata the app set when uploading. Empty if there is none. */
  metadata: Record<string, string>;
}

/** Available space. The Drive fields are optional because they depend on the session. */
export interface SpaceInfo {
  localFreeBytes: number;
  driveFreeBytes?: number;
  driveLimitBytes?: number;
}
