import { describe, expect, it } from 'vitest';

import { ErrorBackup } from '../../domain/errors';
import { testEventEmitter, testLocalStorage, testRemoteStorage } from '../testDoubles';

import { UploadBackup } from './UploadBackup';

const FILE = 'path/backup.zip';
const content = () => new Blob(['abcd'], { type: 'application/zip' });

function input(extra: Partial<Parameters<UploadBackup['execute']>[0]> = {}) {
  return {
    path: FILE,
    name: 'backup.zip',
    metadata: { version: '3' },
    operationId: 'op-1',
    ...extra,
  };
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

describe('UploadBackup', () => {
  it('uploads with the expected phase order and returns the backup with the operation id', async () => {
    const remote = testRemoteStorage({ space: { driveLimitBytes: 1000, driveFreeBytes: 900 } });
    const emitter = testEventEmitter();
    const local = testLocalStorage({ files: { [FILE]: content() } });

    const backup = await new UploadBackup(remote, local, emitter).execute(input());

    expect(emitter.names()).toEqual([
      'state:preparing',
      'state:checking-space',
      'state:uploading',
      'state:verifying',
      'state:done',
    ]);
    expect(backup).toMatchObject({ name: 'backup.zip', bytes: 4, operationId: 'op-1', metadata: { version: '3' } });
    expect(remote.uploads[0].metadata).toEqual({ version: '3' });
  });

  it('missing file: file.001, error emitted and Drive never called', async () => {
    const remote = testRemoteStorage();
    const emitter = testEventEmitter();

    const error = await errorOf(new UploadBackup(remote, testLocalStorage(), emitter).execute(input()));

    expect(error.code).toBe('file.001');
    expect(emitter.of('error')[0]).toMatchObject({ operationId: 'op-1', code: 'file.001', recoverable: false });
    expect(remote.calls).toEqual([]);
  });

  it('empty file: file.003', async () => {
    const error = await errorOf(
      new UploadBackup(
        testRemoteStorage(),
        testLocalStorage({ files: { [FILE]: new Blob([]) } }),
        testEventEmitter(),
      ).execute(input()),
    );
    expect(error.code).toBe('file.003');
  });

  it('no space in Drive: space.002 before reading or uploading anything', async () => {
    const remote = testRemoteStorage({ space: { driveLimitBytes: 1000, driveFreeBytes: 3 } });
    const emitter = testEventEmitter();

    const error = await errorOf(
      new UploadBackup(remote, testLocalStorage({ files: { [FILE]: content() } }), emitter).execute(input()),
    );

    expect(error.code).toBe('space.002');
    expect(error.parameters).toMatchObject({ needed: 4, free: 3 });
    expect(remote.uploads).toHaveLength(0);
    expect(emitter.names()).not.toContain('state:uploading');
  });

  it('if Drive does not report free space, the upload is not blocked', async () => {
    const remote = testRemoteStorage({ space: {} });
    const backup = await new UploadBackup(
      remote,
      testLocalStorage({ files: { [FILE]: content() } }),
      testEventEmitter(),
    ).execute(input());
    expect(backup.bytes).toBe(4);
  });

  it('quota near its limit: emits a space.010 warning and the upload continues', async () => {
    const remote = testRemoteStorage({ space: { driveLimitBytes: 100, driveFreeBytes: 5 } });
    const emitter = testEventEmitter();

    await new UploadBackup(remote, testLocalStorage({ files: { [FILE]: content() } }), emitter).execute(input());

    expect(emitter.of('warning')[0]).toMatchObject({ operationId: 'op-1', code: 'space.010' });
    expect(remote.uploads).toHaveLength(1);
  });

  it('if the received size does not match: drive.001 with the reason, and no done phase', async () => {
    const remote = testRemoteStorage({ returnedSize: 3 });
    const emitter = testEventEmitter();

    const error = await errorOf(
      new UploadBackup(remote, testLocalStorage({ files: { [FILE]: content() } }), emitter).execute(input()),
    );

    expect(error.code).toBe('drive.001');
    expect(error.parameters).toMatchObject({ reason: 'size-mismatch', sent: 4, received: 3 });
    expect(emitter.names()).not.toContain('state:done');
  });

  it('invalid metadata: metadata.001 without touching Drive', async () => {
    const remote = testRemoteStorage();
    const error = await errorOf(
      new UploadBackup(remote, testLocalStorage({ files: { [FILE]: content() } }), testEventEmitter()).execute(
        input({ metadata: { big: 'x'.repeat(200) } }),
      ),
    );
    expect(error.code).toBe('metadata.001');
    expect(remote.calls).toEqual([]);
  });

  it('cancellation: emits state cancelled and error operation.001', async () => {
    const control = new AbortController();
    const remote = {
      ...testRemoteStorage({ space: {} }),
      async upload() {
        control.abort();
        throw new DOMException('aborted', 'AbortError');
      },
    };
    const emitter = testEventEmitter();

    const error = await errorOf(
      new UploadBackup(remote, testLocalStorage({ files: { [FILE]: content() } }), emitter).execute(
        input({ signal: control.signal }),
      ),
    );

    expect(error.code).toBe('operation.001');
    expect(emitter.names().slice(-2)).toEqual(['state:cancelled', 'error']);
  });

  it('an unexpected failure becomes drive.001 keeping the original message', async () => {
    const remote = {
      ...testRemoteStorage(),
      async space(): Promise<never> {
        throw new Error('boom');
      },
    };
    const error = await errorOf(
      new UploadBackup(remote, testLocalStorage({ files: { [FILE]: content() } }), testEventEmitter()).execute(input()),
    );
    expect(error.code).toBe('drive.001');
    expect(error.message).toBe('boom');
    expect(error.parameters).toMatchObject({ reason: 'unexpected' });
  });
});
