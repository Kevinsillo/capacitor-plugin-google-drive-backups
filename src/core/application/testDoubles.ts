import { ErrorBackup } from '../domain/errors';
import type { RemoteBackup } from '../domain/models';

import type { EventMap, EventName } from './events';
import type { IEventEmitter } from './ports/IEventEmitter';
import type { ILocalStorage } from './ports/ILocalStorage';
import type { DriveSpace, IRemoteStorage, RemoteUpload } from './ports/IRemoteStorage';

/** Record of emitted events, used to check order and content in tests. */
export interface EventRecord {
  events: { event: EventName; data: unknown }[];
  of<E extends EventName>(event: E): EventMap[E][];
  names(): string[];
}

export function testEventEmitter(): IEventEmitter & EventRecord {
  const events: { event: EventName; data: unknown }[] = [];
  return {
    events,
    emit(event, data) {
      events.push({ event, data });
    },
    of(event) {
      return events.filter((e) => e.event === event).map((e) => e.data as never);
    },
    names() {
      return events.map((e) => (e.event === 'state' ? `state:${(e.data as { phase: string }).phase}` : e.event));
    },
  };
}

/** In-memory local storage. Access errors are simulated through the path maps. */
export function testLocalStorage(
  options: {
    free?: number;
    files?: Record<string, Blob>;
  } = {},
): ILocalStorage & { written: Record<string, Blob> } {
  const files = options.files ?? {};
  const written: Record<string, Blob> = {};
  return {
    written,
    async freeSpace() {
      return options.free ?? Number.MAX_SAFE_INTEGER;
    },
    async size(path) {
      const file = files[path];
      if (!file) throw new ErrorBackup('file.001', { path });
      return file.size;
    },
    async read(path) {
      const file = files[path];
      if (!file) throw new ErrorBackup('file.001', { path });
      return file;
    },
    async write(path, content) {
      written[path] = content;
    },
  };
}

/** In-memory remote storage: keeps what was uploaded and returns backups with the real size. */
export function testRemoteStorage(
  options: {
    space?: DriveSpace;
    backupsInDrive?: Record<string, Blob>;
    /** If set, the server returns this size instead of the real one (simulates corruption). */
    returnedSize?: number;
  } = {},
): IRemoteStorage & { uploads: RemoteUpload[]; calls: string[] } {
  const uploads: RemoteUpload[] = [];
  const calls: string[] = [];
  const backups = options.backupsInDrive ?? {};
  let nextId = 1;

  return {
    uploads,
    calls,
    async space() {
      calls.push('space');
      return options.space ?? {};
    },
    async upload(input) {
      calls.push('upload');
      uploads.push(input);
      const id = `F${nextId++}`;
      const backup: RemoteBackup = {
        id,
        name: input.name,
        bytes: options.returnedSize ?? input.content.size,
        createdAt: '2026-11-08T00:00:00.000Z',
        metadata: input.metadata,
      };
      backups[id] = input.content;
      return backup;
    },
    async list() {
      calls.push('list');
      return [];
    },
    async download(id) {
      calls.push('download');
      const content = backups[id];
      if (!content) throw new ErrorBackup('drive.002', { id });
      return content;
    },
    async delete() {
      calls.push('delete');
    },
  };
}
