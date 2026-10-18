import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import { sendMail } from '../utils/mailer.js';
import { emailConfirmTemplate } from '../utils/emailTemplates.js';
import env from '../config/env.js';
import * as otpService from './otpService.js';

/**
 * Email confirmation service (OTP-based).
 * - No emailed links: a 6-digit code is delivered instead.
 * - Identical response whether or not the email exists (no enumeration).
 * - When SMTP is disabled, sendMail returns {skipped:true} and we still
 *   return success so the flow is testable without a mail server.
 */

export const sendConfirmationOtp = async (user, { requestId = null } = {}) => {
  if (!user.email) {
    throw AppError.badRequest('لا يوجد بريد إلكتروني مرتبط بهذا الحساب');
  }

  const code = await otpService.issueOtp(user._id, 'email_confirm');
  const { subject, html, text } = emailConfirmTemplate(
    user.name,
    code,
    env.otp.ttlMinutes,
  );

  const result = await sendMail({ to: user.email, subject, html, text });

  return {
    sent: result.sent,
    skipped: result.skipped,
    expiresInMinutes: env.otp.ttlMinutes,
  };
};

export const confirmEmailWithOtp = async (userId, code, { requestId = null } = {}) => {
  const user = await User.findById(userId);
  if (!user || !user.isAccountActive()) {
    throw AppError.notFound('المستخدم غير موجود');
  }
  if (user.isVerified) {
    return { alreadyVerified: true };
  }

  await otpService.consumeOtp(userId, 'email_confirm', code);

  user.isVerified = true;
  await user.save();

  return { verified: true };
};

export default { sendConfirmationOtp, confirmEmailWithOtp };
