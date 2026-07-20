// Computes a SHA-256 hex checksum for a buffer.
import { createHash } from 'crypto';

// Shared hashing helper used across upload/parse flows wherever a content checksum is needed.
export function computeSha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
