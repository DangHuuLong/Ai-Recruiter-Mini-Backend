// Minimal hand-rolled HS256 JWT sign/verify helpers (no external JWT library dependency).
import { createHmac, timingSafeEqual } from 'crypto';

import { JwtPayload } from '../types/auth-user.type';

const JWT_ALGORITHM = 'HS256';

// Encodes a JWT header/payload segment; used internally by signJwt() and signValue().
function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

// Decodes a JWT header/payload segment; used internally by verifyJwt().
function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

// Computes the HMAC-SHA256 signature segment; shared by signJwt() and verifyJwt().
function signValue(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

// Issues an access/refresh token; called by the auth service on login and token refresh.
export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresInSeconds: number,
): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + expiresInSeconds;

  const header = {
    alg: JWT_ALGORITHM,
    typ: 'JWT',
  };

  const fullPayload: JwtPayload = {
    ...payload,
    iat: issuedAt,
    exp: expiresAt,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = signValue(unsignedToken, secret);

  return `${unsignedToken}.${signature}`;
}

// Validates and decodes a Bearer token; called by JwtAuthGuard.canActivate() on every protected request.
export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signValue(unsignedToken, secret);

  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8')) as {
      alg?: string;
      typ?: string;
    };

    if (header.alg !== JWT_ALGORITHM || header.typ !== 'JWT') {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);

    if (
      !payload.sub ||
      !payload.organizationId ||
      !payload.email ||
      !payload.role ||
      payload.exp <= now
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
