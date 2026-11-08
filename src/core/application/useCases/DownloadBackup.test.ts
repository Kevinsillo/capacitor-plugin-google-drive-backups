import { describe, expect, it } from 'vitest';

import { ErrorBackup } from '../../domain/errors';
import type { RemoteBackup } from '../../domain/models';
import { testEventEmitter, testLocalStorage, testRemoteStorage } from '../testDoubles';

import { DownloadBackup } from './DownloadBackup';

function backup(extra: Partial<RemoteBackup> = {}): RemoteBackup {
  return { id: 'F1', name: 'backup.zip', bytes: 4, createdAt: '2026-11-08T00:00:00.000Z', metadata: {}, ...extra };
}

async function errorOf(promise: Promise<unknown>): Promise<ErrorBackup> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ErrorBackup) return error;
    throw error;
  }
  throw new Error('should have failed');
}

describe('DownloadBackup', () => {
  it('downloads, verifies the size, writes and emits the phases', async () => {
    const remote = testRemoteStorage({ backupsInDrive: { F1: new Blob(['abcd']) } });
    const local = testLocalStorage({ free: 1000 });
    const emitter = testEventEmitter();

    const result = await new DownloadBackup(remote, local, emitter).execute({
      backup: backup(),
      destination: 'target/backup.zip',
      operationId: 'op-2',
    });

    expect(emitter.names()).toEqual([
      'state:preparing',
      'state:checking-space',
      'state:downloading',
      'state:verifying',
      'state:done',
    ]);
    expect(local.written['target/backup.zip'].size).toBe(4);
    expect(result).toEqual({ operationId: 'op-2', path: 'target/backup.zip', bytes: 4 });
  });

  it('not enough local space: space.001 and nothing is downloaded', async () => {
    const remote = testRemoteStorage({ backupsInDrive: { F1: new Blob(['abcd']) } });
    const emitter = testEventEmitter();

    const error = await errorOf(
      new DownloadBackup(remote, testLocalStorage({ free: 4 }), emitter).execute({
        backup: backup(),
        destination: 'd',
        operationId: 'op-2',
      }),
    );

    expect(error.code).toBe('space.001');
    expect(remote.calls).not.toContain('download');
    expect(emitter.of('error')[0]).toMatchObject({ operationId: 'op-2', code: 'space.001' });
  });

  it('if the received size does not match: drive.001 and nothing is written to the destination', async () => {
    const remote = testRemoteStorage({ backupsInDrive: { F1: new Blob(['ab']) } });
    const local = testLocalStorage({ free: 1000 });

    const error = await errorOf(
      new DownloadBackup(remote, local, testEventEmitter()).execute({
        backup: backup(),
        destination: 'd',
        operationId: 'op-2',
      }),
    );

    expect(error.code).toBe('drive.001');
    expect(error.parameters).toMatchObject({ reason: 'size-mismatch', expected: 4, received: 2 });
    expect(local.written).toEqual({});
  });

  it('backup no longer in Drive: drive.002', async () => {
    const error = await errorOf(
      new DownloadBackup(testRemoteStorage(), testLocalStorage({ free: 1000 }), testEventEmitter()).execute({
        backup: backup(),
        destination: 'd',
        operationId: 'op-2',
      }),
    );
    expect(error.code).toBe('drive.002');
  });
});
