/**
 * Port for device storage. Access errors are thrown as `ErrorBackup` (`file.001` does not exist,
 * `file.002` no permission), so use cases do not have to translate them.
 */
export interface ILocalStorage {
  freeSpace(): Promise<number>;
  size(path: string): Promise<number>;
  read(path: string): Promise<Blob>;
  write(path: string, content: Blob): Promise<void>;
}
