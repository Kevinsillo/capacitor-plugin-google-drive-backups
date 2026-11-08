import { ErrorBackup } from './errors';

/** Limits of `appProperties` in Drive v3 for properties private to the app. */
export const MAX_METADATA_PROPERTIES = 30;
export const MAX_PROPERTY_BYTES = 124;

const encoder = new TextEncoder();

/**
 * Validates metadata before uploading. Throws `metadata.001` if it exceeds the Drive limits,
 * without making any request, so the error reaches the developer instead of a 400 from the API.
 */
export function validateMetadata(metadata: Record<string, string>): void {
  const keys = Object.keys(metadata);

  if (keys.length > MAX_METADATA_PROPERTIES) {
    throw new ErrorBackup('metadata.001', {
      reason: 'too-many-properties',
      count: keys.length,
      max: MAX_METADATA_PROPERTIES,
    });
  }

  for (const key of keys) {
    const bytes = encoder.encode(key).length + encoder.encode(metadata[key]).length;
    if (bytes > MAX_PROPERTY_BYTES) {
      throw new ErrorBackup('metadata.001', {
        reason: 'property-too-long',
        key,
        bytes,
        max: MAX_PROPERTY_BYTES,
      });
    }
  }
}
