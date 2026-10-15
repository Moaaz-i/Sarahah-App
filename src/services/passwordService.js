import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import PasswordResetToken from '../models/PasswordResetToken.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import { hashToken } from '../utils/hashToken.js';
import { revokeAllForUser } from './tokenService.js';
import env from '../config/env.js';

const auditRetention = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

/**
 * Password reset service.
 *
 * Requesting a reset link is DISABLED: email sending was removed from this
 * project and no other channel can hand the token to the user, so there is
 * nothing to deliver it with. The consuming half (`resetPassword`) is kept —
 * it is channel-agnostic and still verifies any token it is handed.
 *
 * - Only the SHA-256 digest of the reset token is stored.
 * - Validity is checked against expiresAt AND usedAt at use time
 *   (we do NOT rely on MongoDB's TTL deletion, which is not immediate).
 * - Consumption is atomic (findOneAndUpdate on usedAt:null) so a token can
 *   only be used once, even under concurrent requests.
 */

export const resetPassword = async ({ token, newPassword }, { requestId = null } = {}) => {
  const tokenHash = hashToken(token);

  // We never log the raw token; only the digest could ever be referenced.
  const record = await PasswordResetToken.findOne({ tokenHash }).select('+tokenHash');
  if (!record) {
    throw AppError.unauthenticated('Reset token is invalid', ERROR_CODES.INVALID_TOKEN);
  }

  const now = new Date();
  if (record.usedAt) {
    throw AppError.unauthenticated('Reset token has already been used', ERROR_CODES.TOKEN_ALREADY_USED);
  }
  if (record.expiresAt <= now) {
    throw AppError.unauthenticated('Reset token has expired', ERROR_CODES.TOKEN_EXPIRED);
  }

  // Atomic single-use claim: only one concurrent request can win.
  const claimed = await PasswordResetToken.findOneAndUpdate(
    { _id: record._id, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  );
  if (!claimed) {
    throw AppError.unauthenticated('Reset token has already been used', ERROR_CODES.TOKEN_ALREADY_USED);
  }

  const user = await User.findById(record.user).select('+password');
  if (!user || !user.isAccountActive()) {
    throw AppError.unauthenticated('Reset token is invalid', ERROR_CODES.INVALID_TOKEN);
  }

  if (await bcrypt.compare(newPassword, user.password || '')) {
    throw AppError.badRequest('New password must be different from the current one');
  }

  user.password = await bcrypt.hash(newPassword, env.security.bcryptRounds);
  await user.save();

  // Kill every existing session for this user.
  await revokeAllForUser(user._id, { reason: 'password_reset' });

  await AuditLog.create({
    actor: user._id,
    action: 'password.reset_completed',
    targetType: 'User',
    targetId: String(user._id),
    requestId,
    metadata: { sessionsRevoked: true },
    expiresAt: auditRetention(),
  });

  return { reset: true, sessionsRevoked: true };
};

/** Helper used by tests to build a raw token without sending email. */
export const createResetTokenRecordForTests = async (userId, { ttlMs = 15 * 60 * 1000 } = {}) => {
  const raw = crypto.randomBytes(32).toString('base64url');
  await PasswordResetToken.create({
    user: userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttlMs),
    usedAt: null,
  });
  return raw;
};

export default { resetPassword };
