import { describe, expect, it } from 'vitest';

import { ErrorBackup } from './errors';
import { MAX_PROPERTY_BYTES, MAX_METADATA_PROPERTIES, validateMetadata } from './metadata';

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof ErrorBackup ? error.code : 'other';
  }
  return undefined;
}

describe('validateMetadata', () => {
  it('accepts an empty map and properties within the limits', () => {
    expect(codeOf(() => validateMetadata({}))).toBeUndefined();
    expect(codeOf(() => validateMetadata({ version: '3' }))).toBeUndefined();
  });

  it(`accepts exactly ${MAX_METADATA_PROPERTIES} properties`, () => {
    const metadata: Record<string, string> = {};
    for (let i = 0; i < MAX_METADATA_PROPERTIES; i++) metadata[`k${i}`] = 'v';
    expect(codeOf(() => validateMetadata(metadata))).toBeUndefined();
  });

  it(`rejects more than ${MAX_METADATA_PROPERTIES} properties with metadata.001`, () => {
    const metadata: Record<string, string> = {};
    for (let i = 0; i <= MAX_METADATA_PROPERTIES; i++) metadata[`k${i}`] = 'v';
    expect(codeOf(() => validateMetadata(metadata))).toBe('metadata.001');
  });

  it('counts key and value together in UTF-8 bytes', () => {
    // 4-byte key plus a value that fills the maximum exactly
    const exactValue = 'x'.repeat(MAX_PROPERTY_BYTES - 4);
    expect(codeOf(() => validateMetadata({ clav: exactValue }))).toBeUndefined();
    expect(codeOf(() => validateMetadata({ clav: exactValue + 'x' }))).toBe('metadata.001');
  });

  it('counts multibyte characters as several bytes', () => {
    // 'ñ' takes 2 bytes in UTF-8: 62 of them plus a 1-byte key = 125 bytes
    expect(codeOf(() => validateMetadata({ a: 'ñ'.repeat(62) }))).toBe('metadata.001');
    expect(codeOf(() => validateMetadata({ a: 'ñ'.repeat(61) }))).toBeUndefined();
  });

  it('reports the key and the reason in the parameters', () => {
    try {
      validateMetadata({ big: 'x'.repeat(200) });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorBackup);
      const e = error as ErrorBackup;
      expect(e.parameters).toMatchObject({ reason: 'property-too-long', key: 'big' });
    }
  });
});
