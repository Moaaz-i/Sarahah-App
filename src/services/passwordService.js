import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import { sendMail } from '../utils/mailer.js';
import { passwordResetTemplate } from '../utils/emailTemplates.js';
import env from '../config/env.js';
import { hashToken } from '../utils/hashToken.js';
import { revokeAllForUser } from './tokenService.js';
import * as otpService from './otpService.js';

const auditRetention = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

/**
 * Password reset service (OTP-based).
 *
 * Flow:
 *  1. POST /password/forgot  {email}          -> 6-digit code emailed.
 *  2. POST /password/reset   {email,otp,newPassword} -> code verified, password set.
 *
 * Security properties:
 *  - Response is identical whether or not the account exists (no enumeration).
 *  - Codes are single-use, expire after env.otp.ttlMinutes, and are burned
 *    after env.otp.maxAttempts wrong guesses.
 *  - Consumption is atomic (findOneAndUpdate on usedAt:null).
 *  - A successful reset revokes every existing session.
 */

export const requestPasswordReset = async (email, { requestId = null } = {}) => {
  const normalized = String(email).toLowerCase().trim();

  const user = await User.findOne({ email: normalized });

  // Always return the same shape regardless of whether the user exists.
  const baseResponse = {
    delivered: false,
    skipped: false,
    expiresInMinutes: env.otp.ttlMinutes,
  };

  if (!user || !user.isAccountActive()) {
    // Still "deliver" nothing but report success to prevent enumeration.
    return baseResponse;
  }

  const code = await otpService.issueOtp(user._id, 'password_reset');
  const { subject, html, text } = passwordResetTemplate(
    user.name,
    code,
    env.otp.ttlMinutes,
  );

  const result = await sendMail({ to: user.email, subject, html, text });

  return {
    ...baseResponse,
    delivered: result.sent,
    skipped: result.skipped,
  };
};

export const resetPasswordWithOtp = async (
  { email, otp, newPassword },
  { requestId = null } = {},
) => {
  const normalized = String(email).toLowerCase().trim();
  const user = await User.findOne({ email: normalized }).select('+password +deletedAt');

  if (!user || !user.isAccountActive()) {
    throw AppError.badRequest('الرمز غير صحيح أو منتهي', { code: ERROR_CODES.INVALID_TOKEN });
  }

  // Verify + consume the OTP (atomic).
  await otpService.consumeOtp(user._id, 'password_reset', otp);

  if (await bcrypt.compare(newPassword, user.password || '')) {
    throw AppError.badRequest('كلمة المرور الجديدة يجب أن تختلف عن الحالية');
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
    metadata: { sessionsRevoked: true, via: 'otp' },
    expiresAt: auditRetention(),
  });

  return { reset: true, sessionsRevoked: true };
};

/** Helper used by tests to build a raw OTP without sending email. */
export const createResetOtpForTests = async (userId) =>
  otpService.createOtpForTests(userId, 'password_reset');

/** Legacy helper: still referenced by old tests. Returns null (disabled). */
export const createResetTokenRecordForTests = async () => null;

export default { requestPasswordReset, resetPasswordWithOtp, createResetOtpForTests };
