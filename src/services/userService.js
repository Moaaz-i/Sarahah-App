import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Report from '../models/Report.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import { toPublicUser, sanitizeUser } from '../utils/sanitizeUser.js';
import env from '../config/env.js';
import * as tokenService from './tokenService.js';

const auditRetention = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

/** Public profile: username, name, bio, avatar, createdAt. Nothing else. */
export const getPublicProfile = async (username) => {
  const user = await User.findOne({
    username: String(username).toLowerCase().trim(),
    isActive: true,
    deletedAt: null,
  });

  if (!user) throw AppError.notFound('User not found');
  return { user: toPublicUser(user) };
};

/** Update own profile. Only whitelisted fields reach the database. */
export const updateProfile = async (userId, updates) => {
  const allowed = {};
  if (updates.name !== undefined) allowed.name = updates.name;
  if (updates.bio !== undefined) allowed.bio = updates.bio;
  if (updates.avatar !== undefined) allowed.avatar = updates.avatar;

  if (Object.keys(allowed).length === 0) {
    throw AppError.badRequest('No valid fields to update');
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: allowed },
    { new: true, runValidators: true, context: 'query' },
  );

  if (!user) throw AppError.notFound('User not found');
  return { user: sanitizeUser(user) };
};

/**
 * Change password.
 * - Verifies the current password.
 * - Stores the new bcrypt hash.
 * - Revokes EVERY refresh token so old sessions cannot be reused.
 */
/**
 * Confirm the caller knows the account password.
 *
 * Google-only accounts have no password at all (the field is ABSENT, not
 * empty), so demanding one would make both "change password" and "delete
 * account" impossible for them: `bcrypt.compare(x, undefined)` always fails,
 * so they could never adopt a password and never delete their own account.
 * Such callers are trusted on the strength of their (15-minute) session
 * instead. Any account that DOES have a password must still present it, so a
 * password account can never skip this check.
 */
const assertPasswordMatches = async (user, password) => {
  if (!user.password) return;

  const matches = await bcrypt.compare(password ?? '', user.password);
  if (!matches) {
    throw AppError.unauthenticated('Password is incorrect', ERROR_CODES.INVALID_CREDENTIALS);
  }
};

export const changePassword = async (userId, { currentPassword, newPassword }, meta = {}) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw AppError.notFound('User not found');

  await assertPasswordMatches(user, currentPassword);

  // Only meaningful once we know there is a current password to differ from.
  if (user.password && (await bcrypt.compare(newPassword, user.password))) {
    throw AppError.badRequest('New password must be different from the current one');
  }

  user.password = await bcrypt.hash(newPassword, env.security.bcryptRounds);
  await user.save();

  await tokenService.revokeAllForUser(user._id, { reason: 'password_change' });

  await AuditLog.create({
    actor: user._id,
    action: 'user.password_changed',
    targetType: 'User',
    targetId: String(user._id),
    requestId: meta.requestId ?? null,
    metadata: { sessionsRevoked: true },
    expiresAt: auditRetention(),
  });

  return { passwordChanged: true };
};

/**
 * Account deletion policy (documented behaviour):
 * 1. The account is soft-deleted (deletedAt set, isActive=false).
 * 2. Personal data is wiped: name -> "Deleted user", username/email/bio/avatar
 *    cleared, password replaced by an unusable random hash.
 *    The username/email placeholders stay reserved for the retention window
 *    (DELETED_ACCOUNT_RETENTION_DAYS) to avoid identity recycling.
 * 3. Received messages are soft-deleted too (hidden from any inbox) and are
 *    purged after the retention window by the cleanup job.
 * 4. Reports filed BY this user keep existing (moderation integrity) but the
 *    reporter reference is detached (set to null) - the anonymous message and
 *    the reason stay.
 * 5. All refresh tokens are revoked; audit logs are kept (they contain no
 *    personal data) until their own TTL expires.
 */
export const deleteAccount = async (user, { password }, meta = {}) => {
  const full = await User.findById(user._id).select('+password');
  if (!full) throw AppError.notFound('User not found');

  await assertPasswordMatches(full, password);

  const placeholder = `deleted_${String(full._id).slice(-12)}`;
  const randomHash = await bcrypt.hash(
    `removed-${Date.now()}-${Math.random()}`,
    env.security.bcryptRounds,
  );

  full.name = 'Deleted user';
  full.username = placeholder;
  full.email = null;
  full.password = randomHash;
  full.bio = '';
  full.avatar = '';
  full.isActive = false;
  full.isVerified = false;
  full.isReceivingMessages = false;
  full.authProvider = 'local';
  full.deletedAt = new Date();
  await full.save();

  // Hide the messages this user had received.
  await Message.updateMany(
    { recipient: full._id, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
  );

  // Detach the reporter reference from reports filed by this user.
  await Report.updateMany({ reporter: full._id }, { $set: { reporter: null } });

  // Kill every session.
  await tokenService.revokeAllForUser(full._id, { reason: 'account_deleted' });

  await AuditLog.create({
    actor: null,
    action: 'user.account_deleted',
    targetType: 'User',
    targetId: String(full._id),
    requestId: meta.requestId ?? null,
    metadata: {
      retentionDays: env.security.maxDeletedAccountsRetentionDays,
      messagesSoftDeleted: true,
      reportsKept: true,
    },
    expiresAt: auditRetention(),
  });

  return {
    deleted: true,
    policy: {
      account: 'soft-deleted and personal data wiped',
      messages: 'soft-deleted and purged after the retention window',
      reports: 'kept for moderation, reporter reference detached',
      sessions: 'all refresh tokens revoked',
    },
  };
};

export default { getPublicProfile, updateProfile, changePassword, deleteAccount };
