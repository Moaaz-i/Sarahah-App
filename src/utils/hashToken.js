import crypto from 'node:crypto';

/**
 * One-way hashing for opaque tokens (refresh tokens, password reset tokens).
 * We only ever store the digest, never the raw token.
 */
export const hashToken = (rawToken) =>
  crypto.createHash('sha256').update(String(rawToken), 'utf8').digest('hex');

/** Constant-time comparison of two digests. */
export const safeEquals = (a, b) => {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Anonymized fingerprint used for flood control on anonymous endpoints.
 * Built from a secret salt + IP, so the raw IP is never stored.
 */
export const fingerprintFromRequest = (req) => {
  const salt = process.env.FINGERPRINT_SALT || 'dev_only_fingerprint_salt';
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(`${salt}:${ip}`, 'utf8').digest('hex');
};

export default hashToken;
