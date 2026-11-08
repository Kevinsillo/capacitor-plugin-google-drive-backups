import { describe, expect, it } from 'vitest';

import { ErrorBackup } from '../../domain/errors';

import { DriveRestClient, type DriveRestClientOptions } from './DriveRestClient';

interface FetchCall {
  url: string;
  init: RequestInit;
}

/** `fetch` double: returns prepared responses in order and records each call. */
function fakeFetch(responses: (Response | Error)[]) {
  const calls: FetchCall[] = [];
  const fakeFetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error('no prepared response');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetch: fakeFetchFn, calls };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function driveError(status: number, reason?: string): Response {
  return json(status, { error: { code: status, errors: reason ? [{ reason }] : [] } });
}

function client(fetchFn: typeof fetch, extra: Partial<DriveRestClientOptions> = {}, waits: number[] = []) {
  return new DriveRestClient({
    fetch: fetchFn,
    getToken: async () => 'TOKEN',
    storageLocation: 'appDataFolder',
    wait: async (ms) => {
      waits.push(ms);
    },
    ...extra,
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof ErrorBackup ? error.code : `not-ErrorBackup: ${String(error)}`;
  }
  return 'resolved';
}

describe('DriveRestClient.upload', () => {
  it('sends multipart with metadata, appProperties and the appDataFolder parent', async () => {
    const { fetch, calls } = fakeFetch([
      json(200, {
        id: 'F1',
        name: 'backup.zip',
        size: '5',
        createdTime: '2026-11-08T09:00:00.000Z',
        appProperties: { version: '3' },
      }),
    ]);

    const backup = await client(fetch).upload({
      name: 'backup.zip',
      content: new Blob(['hello'], { type: 'application/zip' }),
      metadata: { version: '3' },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('upload/drive/v3/files?uploadType=multipart');
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('Authorization')).toBe('Bearer TOKEN');
    expect(headers.get('Content-Type')).toMatch(/^multipart\/related; boundary=gdb/);

    const body = await new Response(calls[0].init.body as BodyInit).text();
    expect(body).toContain('"name":"backup.zip"');
    expect(body).toContain('"appProperties":{"version":"3"}');
    expect(body).toContain('"parents":["appDataFolder"]');
    expect(body).toContain('Content-Type: application/zip');
    expect(body).toContain('hello');

    expect(backup).toEqual({
      id: 'F1',
      name: 'backup.zip',
      bytes: 5,
      createdAt: '2026-11-08T09:00:00.000Z',
      metadata: { version: '3' },
    });
  });

  it('does not add parents when the storage location is the whole Drive', async () => {
    const { fetch, calls } = fakeFetch([
      json(200, { id: 'F2', name: 'x.zip', createdTime: '2026-01-01T00:00:00.000Z' }),
    ]);
    await client(fetch, { storageLocation: 'drive' }).upload({
      name: 'x.zip',
      content: new Blob(['x']),
      metadata: {},
    });
    const body = await new Response(calls[0].init.body as BodyInit).text();
    expect(body).not.toContain('parents');
  });

  it('validates metadata before calling the API', async () => {
    const { fetch, calls } = fakeFetch([]);
    const code = await codeOf(
      client(fetch).upload({ name: 'x', content: new Blob(['x']), metadata: { big: 'x'.repeat(200) } }),
    );
    expect(code).toBe('metadata.001');
    expect(calls).toHaveLength(0);
  });
});

describe('DriveRestClient.space', () => {
  it('computes free space from limit and usage', async () => {
    const { fetch, calls } = fakeFetch([json(200, { storageQuota: { limit: '1000', usage: '400' } })]);
    const space = await client(fetch).space();
    expect(calls[0].url).toContain('about?fields=storageQuota');
    expect(space).toEqual({ driveLimitBytes: 1000, driveFreeBytes: 600 });
  });

  it('does not invent a limit when the account has none', async () => {
    const { fetch } = fakeFetch([json(200, { storageQuota: { usage: '400' } })]);
    expect(await client(fetch).space()).toEqual({});
  });

  it('never reports negative free space when usage exceeds the limit', async () => {
    const { fetch } = fakeFetch([json(200, { storageQuota: { limit: '100', usage: '150' } })]);
    expect((await client(fetch).space()).driveFreeBytes).toBe(0);
  });
});

describe('DriveRestClient.list', () => {
  it('requests the ordered list, follows pagination and converts the files', async () => {
    const { fetch, calls } = fakeFetch([
      json(200, {
        nextPageToken: 'P2',
        files: [{ id: 'A', name: 'a.zip', size: '10', createdTime: '2026-02-01T00:00:00.000Z' }],
      }),
      json(200, {
        files: [
          { id: 'B', name: 'b.zip', size: '20', createdTime: '2026-01-01T00:00:00.000Z', appProperties: { v: '1' } },
        ],
      }),
    ]);

    const backups = await client(fetch).list();

    const first = new URL(calls[0].url).searchParams;
    expect(first.get('spaces')).toBe('appDataFolder');
    expect(first.get('orderBy')).toBe('createdTime desc');
    expect(first.get('q')).toBe('trashed = false');
    expect(first.get('pageToken')).toBeNull();
    expect(new URL(calls[1].url).searchParams.get('pageToken')).toBe('P2');

    expect(backups).toEqual([
      { id: 'A', name: 'a.zip', bytes: 10, createdAt: '2026-02-01T00:00:00.000Z', metadata: {} },
      { id: 'B', name: 'b.zip', bytes: 20, createdAt: '2026-01-01T00:00:00.000Z', metadata: { v: '1' } },
    ]);
  });
});

describe('DriveRestClient.download and delete', () => {
  it('downloads the content with alt=media', async () => {
    const { fetch, calls } = fakeFetch([new Response('bytes', { status: 200 })]);
    const blob = await client(fetch).download('F1');
    expect(calls[0].url).toContain('/files/F1?alt=media');
    expect(await blob.text()).toBe('bytes');
  });

  it('deletes with DELETE', async () => {
    const { fetch, calls } = fakeFetch([new Response(null, { status: 204 })]);
    await client(fetch).delete('F1');
    expect(calls[0].init.method).toBe('DELETE');
  });

  it('a 404 when downloading is drive.002 and is not retried', async () => {
    const { fetch, calls } = fakeFetch([driveError(404)]);
    expect(await codeOf(client(fetch).download('X'))).toBe('drive.002');
    expect(calls).toHaveLength(1);
  });
});

describe('DriveRestClient: errors and retries', () => {
  it('retries a 429 with exponential delay and then succeeds', async () => {
    const waits: number[] = [];
    const { fetch, calls } = fakeFetch([driveError(429), json(200, { storageQuota: { limit: '10', usage: '0' } })]);
    const space = await client(fetch, {}, waits).space();
    expect(space.driveFreeBytes).toBe(10);
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([500]);
  });

  it('exhausts the retries on 5xx and returns network.003', async () => {
    const waits: number[] = [];
    const { fetch, calls } = fakeFetch([driveError(503), driveError(503), driveError(503), driveError(503)]);
    expect(await codeOf(client(fetch, {}, waits).space())).toBe('network.003');
    expect(calls).toHaveLength(4); // 1 attempt + 3 retries
    expect(waits).toEqual([500, 1000, 2000]);
  });

  it('retries userRateLimitExceeded and returns drive.003 if it persists', async () => {
    const { fetch, calls } = fakeFetch([
      driveError(403, 'userRateLimitExceeded'),
      driveError(403, 'userRateLimitExceeded'),
      driveError(403, 'userRateLimitExceeded'),
      driveError(403, 'userRateLimitExceeded'),
    ]);
    expect(await codeOf(client(fetch).space())).toBe('drive.003');
    expect(calls).toHaveLength(4);
  });

  it('storageQuotaExceeded is space.002 and is not retried', async () => {
    const { fetch, calls } = fakeFetch([driveError(403, 'storageQuotaExceeded')]);
    const code = await codeOf(client(fetch).upload({ name: 'x', content: new Blob(['x']), metadata: {} }));
    expect(code).toBe('space.002');
    expect(calls).toHaveLength(1);
  });

  it('a 401 is auth.002 and is not retried', async () => {
    const { fetch, calls } = fakeFetch([driveError(401)]);
    expect(await codeOf(client(fetch).space())).toBe('auth.002');
    expect(calls).toHaveLength(1);
  });

  it('a 403 with an unknown reason is drive.001 with the reason in the parameters', async () => {
    const { fetch } = fakeFetch([driveError(403, 'forbidden')]);
    try {
      await client(fetch).space();
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as ErrorBackup).code).toBe('drive.001');
      expect((error as ErrorBackup).parameters).toMatchObject({ status: 403, reason: 'forbidden' });
    }
  });

  it('a network failure is network.001', async () => {
    const { fetch } = fakeFetch([new TypeError('fetch failed')]);
    expect(await codeOf(client(fetch).space())).toBe('network.001');
  });

  it('an AbortSignal cancellation is operation.001', async () => {
    const control = new AbortController();
    control.abort();
    const { fetch } = fakeFetch([new DOMException('aborted', 'AbortError')]);
    expect(await codeOf(client(fetch).space(control.signal))).toBe('operation.001');
  });

  it('a timeout is network.002', async () => {
    const { fetch } = fakeFetch([new DOMException('timed out', 'TimeoutError')]);
    expect(await codeOf(client(fetch).space())).toBe('network.002');
  });

  it('if there is no token, the session error arrives without calling the network', async () => {
    const { fetch, calls } = fakeFetch([]);
    const noSession = new DriveRestClient({
      fetch,
      getToken: async () => {
        throw new ErrorBackup('auth.001');
      },
      storageLocation: 'appDataFolder',
    });
    expect(await codeOf(noSession.space())).toBe('auth.001');
    expect(calls).toHaveLength(0);
  });
});
