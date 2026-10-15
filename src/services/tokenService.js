import RefreshToken from '../models/RefreshToken.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import {
  generateRefreshToken,
  getRefreshExpiresAt,
  signAccessToken,
} from '../utils/generateToken.js';
import { hashToken } from '../utils/hashToken.js';

/**
 * Token service: access + refresh tokens with rotation and reuse detection.
 * Raw refresh tokens are returned to the client exactly once; only their
 * SHA-256 digest is persisted.
 */

const RETENTION_DAYS = 365;
const retentionDate = () =>
  new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

/** Issue an access token + a brand new refresh token for a user. */
export const issueTokens = async (user, { userAgent = '' } = {}) => {
  const rawRefresh = generateRefreshToken();

  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(rawRefresh),
    expiresAt: getRefreshExpiresAt(),
    userAgent: String(userAgent).slice(0, 300),
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken: rawRefresh,
    tokenType: 'Bearer',
    expiresIn: 900, // documented access-token lifetime in seconds
  };
};

/** Revoke every refresh token of a user (logout everywhere / password change). */
export const revokeAllForUser = async (userId, { reason = 'logout' } = {}) => {
  const result = await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount;
};

/**
 * Rotate a refresh token.
 * - Unknown token          -> 401
 * - Expired token          -> 401
 * - Already revoked token  -> REUSE DETECTED: revoke the whole chain, 401
 * - Valid token            -> revoke it, issue a new pair, link replacedBy
 */
export const rotateRefreshToken = async (rawToken, { userAgent = '' } = {}) => {
  const tokenHash = hashToken(rawToken);

  const token = await RefreshToken.findOne({ tokenHash }).select('+tokenHash');
  if (!token) {
    throw AppError.unauthenticated('Invalid refresh token', ERROR_CODES.INVALID_TOKEN);
  }

  if (token.revokedAt) {
    // Replay of an old token: assume the token leaked and kill all sessions.
    await revokeAllForUser(token.user, { reason: 'refresh_token_reuse' });
    await AuditLog.create({
      actor: token.user,
      action: 'auth.refresh_token_reuse',
      targetType: 'RefreshToken',
      targetId: String(token._id),
      metadata: { note: 'revoked token replayed, all sessions revoked' },
      expiresAt: retentionDate(),
    });
    throw AppError.unauthenticated(
      'Refresh token reuse detected, all sessions were revoked',
      ERROR_CODES.REFRESH_TOKEN_REUSE,
    );
  }

  if (token.expiresAt <= new Date()) {
    throw AppError.unauthenticated('Refresh token has expired', ERROR_CODES.TOKEN_EXPIRED);
  }

  await token.populate('user');
  const user = token.user;
  if (!user || !user.isAccountActive()) {
    await revokeAllForUser(token.user, { reason: 'inactive_user' });
    throw AppError.unauthenticated('Account is disabled', ERROR_CODES.ACCOUNT_DISABLED);
  }

  // Atomic claim: only one concurrent request wins the rotation.
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: token._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true },
  );

  if (!claimed) {
    await revokeAllForUser(token.user, { reason: 'refresh_race' });
    throw AppError.unauthenticated('Refresh token was already used', ERROR_CODES.TOKEN_ALREADY_USED);
  }

  const rawNext = generateRefreshToken();
  const next = await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(rawNext),
    expiresAt: getRefreshExpiresAt(),
    userAgent: String(userAgent).slice(0, 300),
  });

  claimed.replacedBy = next._id;
  await claimed.save();

  return {
    accessToken: signAccessToken(user),
    refreshToken: rawNext,
    tokenType: 'Bearer',
    expiresIn: 900,
  };
};

/** Revoke one refresh token (used by logout). Returns true when something was revoked. */
export const revokeRefreshToken = async (rawToken) => {
  if (!rawToken) return false;
  const result = await RefreshToken.updateOne(
    { tokenHash: hashToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount > 0;
};

export default {
  issueTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
};
