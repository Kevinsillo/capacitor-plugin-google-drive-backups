import type { Parameters } from './models';

/**
 * Catalog of `category.number` error codes. It is the source of truth: the README and the app's
 * translation files must cover every code. The descriptions are technical English for the
 * developer; user-facing text lives in the consuming app.
 */
export const ERROR_CODES = {
  'auth.001': { description: 'No session: sign in first', recoverable: true },
  'auth.002': { description: 'Access token expired and could not be renewed', recoverable: true },
  'auth.003': { description: 'User cancelled the sign-in', recoverable: true },

  'space.001': { description: 'Not enough free space on the device', recoverable: true },
  'space.002': { description: 'Not enough free space in Google Drive', recoverable: true },
  'space.010': { description: 'Google Drive quota is close to its limit', recoverable: true },

  'network.001': { description: 'No network connection', recoverable: true },
  'network.002': { description: 'The request timed out', recoverable: true },
  'network.003': { description: 'Google Drive returned a server error', recoverable: true },
  'network.010': { description: 'Connection is metered', recoverable: true },

  'file.001': { description: 'The local path does not exist', recoverable: false },
  'file.002': { description: 'No permission to read or write the local path', recoverable: false },
  'file.003': { description: 'The local file is empty', recoverable: false },

  'drive.001': { description: 'Unexpected response from the Google Drive API', recoverable: false },
  'drive.002': { description: 'Backup not found in Google Drive', recoverable: false },
  'drive.003': { description: 'Google Drive API rate limit exceeded', recoverable: true },

  'operation.001': { description: 'Operation cancelled', recoverable: false },
  'operation.002': { description: 'Another operation already uses this operationId', recoverable: false },

  'metadata.001': { description: 'Custom metadata exceeds the Google Drive property limits', recoverable: false },

  'platform.001': { description: 'Not available on this platform', recoverable: false },

  'configuration.001': { description: 'Plugin configuration is missing or invalid', recoverable: false },
  'configuration.002': { description: 'A configuration value is not valid', recoverable: false },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Plugin error. Its fields are the ones sent over the bridge when a promise is rejected. */
export class ErrorBackup extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly parameters: Parameters = {},
    message: string = ERROR_CODES[code].description,
  ) {
    super(message);
    this.name = 'ErrorBackup';
  }

  get recoverable(): boolean {
    return ERROR_CODES[this.code].recoverable;
  }
}
