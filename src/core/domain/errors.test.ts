import { describe, expect, it } from 'vitest';

import { ERROR_CODES, ErrorBackup, type ErrorCode } from './errors';

const CATEGORIES = ['auth', 'space', 'network', 'file', 'drive', 'operation', 'metadata', 'platform', 'configuration'];

describe('ERROR_CODES', () => {
  const codes = Object.keys(ERROR_CODES) as ErrorCode[];

  it.each(codes)('%s has a category.number format with a known category', (code) => {
    expect(code).toMatch(/^[a-z]+\.\d{3}$/);
    expect(CATEGORIES).toContain(code.split('.')[0]);
  });

  it.each(codes)('%s has a non-empty description and a boolean recoverable flag', (code) => {
    const entry = ERROR_CODES[code];
    expect(entry.description.length).toBeGreaterThan(0);
    expect(typeof entry.recoverable).toBe('boolean');
  });

  it('has no duplicate codes', () => {
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('ErrorBackup', () => {
  it('uses the catalog description as the default message', () => {
    const error = new ErrorBackup('space.001');
    expect(error.message).toBe(ERROR_CODES['space.001'].description);
    expect(error.name).toBe('ErrorBackup');
  });

  it('exposes code, parameters and recoverable from the catalog', () => {
    const error = new ErrorBackup('network.003', { attempt: 2 });
    expect(error.code).toBe('network.003');
    expect(error.parameters).toEqual({ attempt: 2 });
    expect(error.recoverable).toBe(ERROR_CODES['network.003'].recoverable);
  });

  it('accepts a custom message without changing the code', () => {
    const error = new ErrorBackup('drive.001', {}, 'HTTP 418');
    expect(error.message).toBe('HTTP 418');
    expect(error.code).toBe('drive.001');
  });
});
