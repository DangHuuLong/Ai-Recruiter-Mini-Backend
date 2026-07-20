import { describe, expect, it } from '@jest/globals';

import { computeSha256Hex } from './checksum.util';

describe('computeSha256Hex', () => {
  it('returns the correct sha256 hex digest for known content', () => {
    expect(computeSha256Hex(Buffer.from('hello world'))).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('is deterministic for the same input', () => {
    const buffer = Buffer.from('some file content');
    expect(computeSha256Hex(buffer)).toBe(computeSha256Hex(buffer));
  });

  it('produces different digests for different content', () => {
    expect(computeSha256Hex(Buffer.from('a'))).not.toBe(computeSha256Hex(Buffer.from('b')));
  });

  it('handles empty buffers', () => {
    expect(computeSha256Hex(Buffer.from(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
