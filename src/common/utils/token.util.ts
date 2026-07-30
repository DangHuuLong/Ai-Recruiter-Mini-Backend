// Generates and hashes opaque random tokens (e.g. for email verification/password reset).
import { createHash, randomBytes } from 'crypto';

// Called by the auth service to mint the token sent to the user (e.g. in an email-verification link).
export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

// Called by the auth service to derive the value stored/looked-up in the DB, keeping raw tokens out of storage.
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
