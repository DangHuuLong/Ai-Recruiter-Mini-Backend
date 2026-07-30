// Password hashing and verification using scrypt with a random salt.
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const PASSWORD_HASH_PREFIX = 'scrypt';
const KEY_LENGTH = 64;

// Called by the auth service on signup/password change to derive a storable password hash.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

  return `${PASSWORD_HASH_PREFIX}$${salt}$${derivedKey.toString('hex')}`;
}

// Called by the auth service on login to check a submitted password against the stored hash.
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [algorithm, salt, storedKey] = passwordHash.split('$');

  if (algorithm !== PASSWORD_HASH_PREFIX || !salt || !storedKey) {
    return false;
  }

  const storedKeyBuffer = Buffer.from(storedKey, 'hex');
  const derivedKey = (await scryptAsync(password, salt, storedKeyBuffer.length)) as Buffer;

  if (storedKeyBuffer.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedKeyBuffer, derivedKey);
}
