import { ErrorBackup } from '../../domain/errors';

/** Reason of a Drive error response (`error.errors[0].reason`), or `undefined` if the body is not valid JSON. */
export async function reasonFromResponse(response: Response): Promise<string | undefined> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { error?: { errors?: { reason?: unknown }[] } };
    const reason = body.error?.errors?.[0]?.reason;
    return typeof reason === 'string' ? reason : undefined;
  } catch {
    return undefined;
  }
}

/** Drive errors that are retried with exponential delay. */
export function isRetryable(status: number, reason?: string): boolean {
  if (status === 429 || status >= 500) return true;
  return status === 403 && (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded');
}

/** Maps a Drive error response to a catalog code. */
export function translateDriveError(status: number, reason?: string): ErrorBackup {
  if (status === 401) return new ErrorBackup('auth.002', { status });
  if (status === 404) return new ErrorBackup('drive.002', { status });
  if (status === 429) return new ErrorBackup('drive.003', { status });
  if (status >= 500) return new ErrorBackup('network.003', { status });

  if (status === 403) {
    if (reason === 'storageQuotaExceeded') return new ErrorBackup('space.002', { status, reason });
    if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
      return new ErrorBackup('drive.003', { status, reason });
    }
  }

  return new ErrorBackup('drive.001', { status, reason: reason ?? 'unknown' });
}
