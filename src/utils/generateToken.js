import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

/**
 * Token utilities.
 * - Access tokens: short-lived JWT (HS256, issuer + audience verified).
 * - Refresh tokens: opaque random strings, only stored hashed in the DB.
 */

export const ACCESS_TOKEN_TYPE = 'access';

/** Build the claims of an access token (never put secrets in here). */
export const buildAccessPayload = (user) => ({
  sub: String(user._id),
  role: user.role,
  type: ACCESS_TOKEN_TYPE,
});

export const signAccessToken = (user) =>
  jwt.sign(buildAccessPayload(user), env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
    algorithm: 'HS256',
  });

/** Verifies signature, algorithm, issuer, audience and expiry. Throws on failure. */
export const verifyAccessToken = (token) =>
  jwt.verify(token, env.jwt.accessSecret, {
    algorithms: ['HS256'],
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  });

/** Cryptographically secure opaque refresh token (returned once, never stored raw). */
export const generateRefreshToken = () => crypto.randomBytes(48).toString('base64url');

/** Secure random token used for password reset links. */
export const generateResetToken = () => crypto.randomBytes(32).toString('base64url');

export const getRefreshExpiresAt = () =>
  new Date(Date.now() + env.jwt.refreshExpiresMs);

export default {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  generateResetToken,
  getRefreshExpiresAt,
};
