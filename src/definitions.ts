import type { PluginListenerHandle } from '@capacitor/core';

import type { EventMap, EventName } from './core/application/events';
import type { RemoteBackup, SpaceInfo, LogLevel } from './core/domain/models';

export type {
  ErrorEvent,
  EventMap,
  EventName,
  LogEvent,
  ProgressEvent,
  StateEvent,
  WarningEvent,
} from './core/application/events';
export type { ErrorCode } from './core/domain/errors';
export type { OperationPhase, RemoteBackup, SpaceInfo, LogLevel, Parameters } from './core/domain/models';

export interface GoogleDriveBackupsPlugin {
  /**
   * Sets the plugin configuration. Every field is optional.
   * - `logLevel`: level of `log` events. Default `silent`.
   * - `webClientId`: OAuth client id for the browser (Google Identity Services). Required on the web only.
   * - `storageLocation`: `appDataFolder` (private to the app, default) or `drive` (visible Drive).
   *   Changing it or `webClientId` signs the user out.
   */
  configure(options: {
    logLevel?: LogLevel;
    webClientId?: string;
    storageLocation?: 'appDataFolder' | 'drive';
  }): Promise<void>;

  /**
   * Signs in with Google. Rejects with `auth.003` if the user cancels. `account` is the email of the
   * signed-in user, or an empty string if it cannot be read.
   */
  signIn(): Promise<{ account: string }>;

  /** Signs out and forgets the token. Does not delete backups in Drive. */
  signOut(): Promise<void>;

  sessionStatus(): Promise<{ connected: boolean; account?: string }>;

  /** Free space on the device and, with a session, in Drive. */
  space(): Promise<SpaceInfo>;

  /**
   * Uploads a local file to Drive. Checks Drive space before uploading (`space.002`).
   * `metadata` is optional and defined by the app; Drive stores it and `list` returns it.
   * Emits `state`, `progress`, `warning` and `error`. `operationId` is optional: if omitted,
   * the plugin generates one and returns it.
   */
  upload(options: {
    path: string;
    name: string;
    metadata?: Record<string, string>;
    operationId?: string;
  }): Promise<RemoteBackup & { operationId: string }>;

  /** Lists the backups in Drive, newest first. It does not choose one: the app does. */
  list(): Promise<{ backups: RemoteBackup[] }>;

  /** Downloads a backup to `destination` (a local path). Emits the same events as `upload`. */
  download(options: { id: string; destination: string; operationId?: string }): Promise<{
    operationId: string;
    path: string;
    bytes: number;
  }>;

  /** Deletes a backup from Drive. Rejects with `drive.002` if it does not exist. */
  delete(options: { id: string }): Promise<void>;

  /** Cancels an upload or download in progress. The cancelled operation rejects with `operation.001`. */
  cancel(options: { operationId: string }): Promise<void>;

  addListener<E extends EventName>(event: E, listener: (data: EventMap[E]) => void): Promise<PluginListenerHandle>;

  removeAllListeners(): Promise<void>;
}
