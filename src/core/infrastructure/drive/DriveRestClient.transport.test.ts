import { describe, expect, it } from 'vitest';

import { DriveRestClient, type UploadProgressCallback } from './DriveRestClient';

describe('DriveRestClient with a custom transport', () => {
  it('uses the transport instead of fetch and passes the upload progress callback', async () => {
    const fetchCalls: string[] = [];
    const progressSeen: [number, number][] = [];
    let transportUrl = '';
    let receivedCallback: UploadProgressCallback | undefined;

    const client = new DriveRestClient({
      fetch: (async (url: string) => {
        fetchCalls.push(String(url));
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
      transport: async (url, _init, onUploadProgress) => {
        transportUrl = url;
        receivedCallback = onUploadProgress;
        onUploadProgress?.(4, 4);
        return new Response(
          JSON.stringify({ id: 'F1', name: 'b.zip', size: '4', createdTime: '2026-01-01T00:00:00.000Z' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
      getToken: async () => 'TOKEN',
      storageLocation: 'appDataFolder',
    });

    const backup = await client.upload({
      name: 'b.zip',
      content: new Blob(['abcd']),
      metadata: {},
      onProgress: (bytes, total) => progressSeen.push([bytes, total]),
    });

    expect(fetchCalls).toEqual([]);
    expect(transportUrl).toContain('upload/drive/v3/files');
    expect(receivedCallback).toBeDefined();
    expect(progressSeen).toEqual([[4, 4]]);
    expect(backup.id).toBe('F1');
  });
});

describe('DriveRestClient.accountEmail', () => {
  it('reads the email of the signed-in user', async () => {
    const client = new DriveRestClient({
      fetch: (async () =>
        new Response(JSON.stringify({ user: { emailAddress: 'someone@example.test' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch,
      getToken: async () => 'TOKEN',
      storageLocation: 'appDataFolder',
    });
    expect(await client.accountEmail()).toBe('someone@example.test');
  });
});
