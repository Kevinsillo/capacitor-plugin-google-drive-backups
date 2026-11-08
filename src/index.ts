import { registerPlugin } from '@capacitor/core';

import type { GoogleDriveBackupsPlugin } from './definitions';

const GoogleDriveBackups = registerPlugin<GoogleDriveBackupsPlugin>('GoogleDriveBackups', {
  web: () => import('./web').then((m) => new m.GoogleDriveBackupsWeb()),
});

export * from './definitions';
export { ERROR_CODES, ErrorBackup } from './core/domain/errors';
export { GoogleDriveBackups };
