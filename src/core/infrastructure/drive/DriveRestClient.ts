import type { DriveSpace, IRemoteStorage, RemoteUpload } from '../../application/ports/IRemoteStorage';
import { ErrorBackup } from '../../domain/errors';
import { validateMetadata } from '../../domain/metadata';
import type { RemoteBackup } from '../../domain/models';

import { isRetryable, reasonFromResponse, translateDriveError } from './driveError';

const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const FILE_FIELDS = 'id,name,size,createdTime,appProperties';

/** Progress callback for uploads: bytes sent so far and total bytes. */
export type UploadProgressCallback = (bytes: number, total: number) => void;

/**
 * Pluggable HTTP transport. The default is `fetch`. A transport that can report upload progress
 * (such as `XMLHttpRequest` on the web) receives the callback and may call it.
 */
export type Transport = (
  url: string,
  init: RequestInit,
  onUploadProgress?: UploadProgressCallback,
) => Promise<Response>;

export interface DriveRestClientOptions {
  /** Injectable `fetch`: the global one in production, a test double in tests. Ignored if `transport` is set. */
  fetch: typeof fetch;
  /** Optional transport that replaces `fetch`, for example one that reports upload progress. */
  transport?: Transport;
  /** Returns a valid token. If there is no session, it must throw `auth.001`. */
  getToken: () => Promise<string>;
  /**
   * Where backups live. `appDataFolder` is private to the app; `drive` uses the whole Drive.
   * Pending decision from the spike (Phase 2 of the plan): configurable until it is closed.
   */
  storageLocation: 'appDataFolder' | 'drive';
  /** Retries for 429, 5xx and quota limits. Default 3. */
  maxRetries?: number;
  /** Delay between retries. Injectable so the tests do not actually wait. */
  wait?: (ms: number) => Promise<void>;
}

/** A file as the API returns it with the requested fields. */
interface DriveFile {
  id: string;
  name: string;
  size?: string;
  createdTime: string;
  appProperties?: Record<string, string>;
}

/** Drive v3 REST client built on `fetch`. Has no dependency on any Google SDK or on Capacitor. */
export class DriveRestClient implements IRemoteStorage {
  private readonly maxRetries: number;
  private readonly wait: (ms: number) => Promise<void>;

  constructor(private readonly options: DriveRestClientOptions) {
    this.maxRetries = options.maxRetries ?? 3;
    this.wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async space(signal?: AbortSignal): Promise<DriveSpace> {
    const response = await this.request(`${API_BASE}/about?fields=storageQuota`, { signal });
    const quota = ((await response.json()) as { storageQuota?: { limit?: string; usage?: string } }).storageQuota;

    // Accounts without a limit do not report `limit`; there is no free space to compute then.
    if (!quota?.limit) return {};
    const limit = Number(quota.limit);
    const used = Number(quota.usage ?? 0);
    return { driveLimitBytes: limit, driveFreeBytes: Math.max(limit - used, 0) };
  }

  async upload(input: RemoteUpload, signal?: AbortSignal): Promise<RemoteBackup> {
    // Before any request: a metadata error must not reach the API as a 400.
    validateMetadata(input.metadata);

    const metadata: Record<string, unknown> = { name: input.name, appProperties: input.metadata };
    if (this.options.storageLocation === 'appDataFolder') metadata.parents = ['appDataFolder'];

    const boundary = `gdb${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${input.content.type || 'application/octet-stream'}\r\n\r\n`,
      input.content,
      `\r\n--${boundary}--`,
    ]);

    const response = await this.request(
      `${UPLOAD_BASE}/files?uploadType=multipart&fields=${FILE_FIELDS}`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
        signal,
      },
      input.onProgress,
    );
    return toRemoteBackup((await response.json()) as DriveFile);
  }

  /** Email of the signed-in account. Used once after sign-in, because the GIS token does not carry it. */
  async accountEmail(signal?: AbortSignal): Promise<string | undefined> {
    const response = await this.request(`${API_BASE}/about?fields=user(emailAddress)`, { signal });
    const body = (await response.json()) as { user?: { emailAddress?: string } };
    return body.user?.emailAddress;
  }

  async list(signal?: AbortSignal): Promise<RemoteBackup[]> {
    const backups: RemoteBackup[] = [];
    let nextPage: string | undefined;

    do {
      const params = new URLSearchParams({
        spaces: this.options.storageLocation,
        q: 'trashed = false',
        orderBy: 'createdTime desc',
        pageSize: '100',
        fields: `nextPageToken,files(${FILE_FIELDS})`,
      });
      if (nextPage) params.set('pageToken', nextPage);

      const response = await this.request(`${API_BASE}/files?${params.toString()}`, { signal });
      const page = (await response.json()) as { files?: DriveFile[]; nextPageToken?: string };
      for (const file of page.files ?? []) backups.push(toRemoteBackup(file));
      nextPage = page.nextPageToken;
    } while (nextPage);

    return backups;
  }

  async download(id: string, signal?: AbortSignal): Promise<Blob> {
    const response = await this.request(`${API_BASE}/files/${encodeURIComponent(id)}?alt=media`, { signal });
    return response.blob();
  }

  async delete(id: string, signal?: AbortSignal): Promise<void> {
    await this.request(`${API_BASE}/files/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
  }

  /**
   * The only way out to the network. Adds the token, retries retryable errors with exponential
   * delay, and translates the rest to the error catalog.
   */
  private async request(
    url: string,
    init: RequestInit & { signal?: AbortSignal } = {},
    onUploadProgress?: UploadProgressCallback,
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.options.getToken();
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);

      let response: Response;
      try {
        const requestInit = { ...init, headers };
        response = this.options.transport
          ? await this.options.transport(url, requestInit, onUploadProgress)
          : await this.options.fetch(url, requestInit);
      } catch (error) {
        throw translateNetworkError(error, init.signal);
      }

      if (response.ok) return response;

      const reason = await reasonFromResponse(response);
      if (isRetryable(response.status, reason) && attempt < this.maxRetries) {
        await this.wait(exponentialDelay(attempt));
        continue;
      }
      throw translateDriveError(response.status, reason);
    }
  }
}

/** 500 ms, 1 s, 2 s… */
function exponentialDelay(attempt: number): number {
  return 500 * 2 ** attempt;
}

/**
 * A `fetch` failure is either the app's own cancellation or a network problem.
 * The `AbortSignal.timeout` timeout arrives as a `TimeoutError`.
 */
function translateNetworkError(error: unknown, signal?: AbortSignal): ErrorBackup {
  if (signal?.aborted) return new ErrorBackup('operation.001');
  if (error instanceof Error && error.name === 'TimeoutError') return new ErrorBackup('network.002');
  return new ErrorBackup('network.001', { cause: error instanceof Error ? error.name : 'unknown' });
}

function toRemoteBackup(file: DriveFile): RemoteBackup {
  return {
    id: file.id,
    name: file.name,
    bytes: Number(file.size ?? 0),
    createdAt: file.createdTime,
    metadata: file.appProperties ?? {},
  };
}
