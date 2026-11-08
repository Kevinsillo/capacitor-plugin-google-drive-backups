import { WebPlugin } from '@capacitor/core';

import { toErrorBackup } from './core/application/operationError';
import { CheckSpace } from './core/application/useCases/CheckSpace';
import { ErrorBackup } from './core/domain/errors';
import type { LogLevel, RemoteBackup, SpaceInfo } from './core/domain/models';
import { DriveRestClient } from './core/infrastructure/drive/DriveRestClient';
import { EventEmitter } from './core/infrastructure/events/EventEmitter';
import { GisAuth } from './core/infrastructure/web/GisAuth';
import { WebLocalStorage } from './core/infrastructure/web/WebLocalStorage';
import { loadGis } from './core/infrastructure/web/loadGis';
import { xhrTransport } from './core/infrastructure/web/xhrTransport';
import type { GoogleDriveBackupsPlugin } from './definitions';

const SCOPES = {
  appDataFolder: 'https://www.googleapis.com/auth/drive.appdata',
  drive: 'https://www.googleapis.com/auth/drive.file',
} as const;

interface Settings {
  logLevel: LogLevel;
  webClientId?: string;
  storageLocation: 'appDataFolder' | 'drive';
}

/**
 * Browser implementation. It signs in with Google Identity Services and lists, checks and deletes
 * backups through the Drive REST API. Upload and download need device file paths, which a browser
 * does not have, so they reject with `platform.001` (reason `no-file-system`) before any network call.
 */
export class GoogleDriveBackupsWeb extends WebPlugin implements GoogleDriveBackupsPlugin {
  private settings: Settings = { logLevel: 'silent', storageLocation: 'appDataFolder' };
  private auth?: GisAuth;
  private client?: DriveRestClient;
  private account?: string;

  private readonly emitter = new EventEmitter(
    (event, data) => this.notifyListeners(event, data),
    () => this.settings.logLevel,
  );

  async configure(options: {
    logLevel?: LogLevel;
    webClientId?: string;
    storageLocation?: 'appDataFolder' | 'drive';
  }): Promise<void> {
    if (options.logLevel !== undefined) this.settings.logLevel = options.logLevel;

    const clientChanged = options.webClientId !== undefined && options.webClientId !== this.settings.webClientId;
    const locationChanged =
      options.storageLocation !== undefined && options.storageLocation !== this.settings.storageLocation;
    if (options.webClientId !== undefined) this.settings.webClientId = options.webClientId;
    if (options.storageLocation !== undefined) this.settings.storageLocation = options.storageLocation;

    if (clientChanged || locationChanged) this.reset();
  }

  async signIn(): Promise<{ account: string }> {
    return this.report(undefined, async () => {
      const { auth, client } = this.session();
      await auth.signIn();
      this.account = (await client.accountEmail()) ?? '';
      this.emitter.log('info', 'signIn', 'session started');
      return { account: this.account };
    });
  }

  async signOut(): Promise<void> {
    return this.report(undefined, async () => {
      await this.auth?.signOut();
      this.account = undefined;
      this.emitter.log('info', 'signOut', 'session closed');
    });
  }

  async sessionStatus(): Promise<{ connected: boolean; account?: string }> {
    const connected = this.auth?.isConnected() ?? false;
    return { connected, account: connected ? this.account : undefined };
  }

  async space(): Promise<SpaceInfo> {
    return this.report(undefined, () =>
      new CheckSpace(this.session().client, new WebLocalStorage(), this.emitter).execute(),
    );
  }

  async upload(options: {
    path: string;
    name: string;
    metadata?: Record<string, string>;
    operationId?: string;
  }): Promise<RemoteBackup & { operationId: string }> {
    const operationId = options.operationId ?? newOperationId();
    return this.report(operationId, async () => {
      throw noFileSystem();
    });
  }

  async list(): Promise<{ backups: RemoteBackup[] }> {
    return this.report(undefined, async () => ({ backups: await this.session().client.list() }));
  }

  async download(options: { id: string; destination: string; operationId?: string }): Promise<{
    operationId: string;
    path: string;
    bytes: number;
  }> {
    const operationId = options.operationId ?? newOperationId();
    return this.report(operationId, async () => {
      throw noFileSystem();
    });
  }

  async delete(options: { id: string }): Promise<void> {
    return this.report(undefined, () => this.session().client.delete(options.id));
  }

  async cancel(options: { operationId: string }): Promise<void> {
    // The web implementation runs no cancellable operation yet, so there is nothing to stop.
    this.emitter.log('debug', 'cancel', `no running operation ${options.operationId}`);
  }

  /** Builds the auth and Drive client on first use, from the current configuration. */
  private session(): { auth: GisAuth; client: DriveRestClient } {
    const clientId = this.settings.webClientId;
    if (!clientId) throw new ErrorBackup('configuration.001', { missing: 'webClientId' });

    if (!this.auth || !this.client) {
      const auth = new GisAuth({
        clientId,
        scope: SCOPES[this.settings.storageLocation],
        gis: loadGis,
      });
      this.auth = auth;
      this.client = new DriveRestClient({
        fetch: (url, init) => fetch(url, init),
        transport: xhrTransport,
        getToken: async () => auth.getToken(),
        storageLocation: this.settings.storageLocation,
      });
    }
    return { auth: this.auth, client: this.client };
  }

  private reset(): void {
    this.auth = undefined;
    this.client = undefined;
    this.account = undefined;
  }

  /**
   * Runs an action and reports any failure as an `error` event before rejecting. `operationId` is
   * included in the event when the action belongs to an operation.
   */
  private async report<T>(operationId: string | undefined, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      const failure = toErrorBackup(error);
      this.emitter.emit('error', {
        operationId,
        code: failure.code,
        parameters: failure.parameters,
        message: failure.message,
        recoverable: failure.recoverable,
      });
      throw failure;
    }
  }
}

function noFileSystem(): ErrorBackup {
  return new ErrorBackup('platform.001', { platform: 'web', reason: 'no-file-system' });
}

function newOperationId(): string {
  return crypto.randomUUID();
}
