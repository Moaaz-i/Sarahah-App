import crypto from 'node:crypto';
import EmailOtp from '../models/EmailOtp.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import env from '../config/env.js';

/**
 * OTP service: issue, verify, and consume numeric one-time codes.
 *
 * Security properties:
 * - Codes are 6-digit numeric (000000-999999). Entropy is low, so every
 *   verification is rate-limited at the route and capped at maxAttempts
 *   here; a wrong guess burns the code after the cap.
 * - Only SHA-256(salt + code) is stored. The raw code never touches the DB.
 * - Codes are single-use: consumption is an atomic findOneAndUpdate on
 *   usedAt:null so two concurrent requests cannot both win.
 * - A new code for the same (user, purpose) invalidates the old one (the
 *   unique partial index enforces one live code per pair).
 */

const codeTtlMs = () => env.otp.ttlMinutes * 60 * 1000;

const hashCode = (salt, code) =>
  crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');

/** Generate a cryptographically-random 6-digit code, zero-padded. */
const generateCode = () => {
  const max = 10 ** env.otp.length;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(env.otp.length, '0');
};

/**
 * Issue a new OTP for a (user, purpose). Returns the raw code so the caller
 * can deliver it (email). Also invalidates any previous unused code.
 */
export const issueOtp = async (userId, purpose) => {
  // Burn any previous live code for this pair.
  await EmailOtp.updateMany(
    { user: userId, purpose, usedAt: null },
    { $set: { usedAt: new Date() } },
  );

  const code = generateCode();
  const salt = crypto.randomBytes(16).toString('hex');

  await EmailOtp.create({
    user: userId,
    purpose,
    salt,
    codeHash: hashCode(salt, code),
    attempts: 0,
    expiresAt: new Date(Date.now() + codeTtlMs()),
    usedAt: null,
  });

  return code;
};

/**
 * Verify + consume an OTP in one atomic step.
 * Throws AppError on: not found, expired, already used, too many attempts,
 * or mismatched code.
 */
export const consumeOtp = async (userId, purpose, code) => {
  const record = await EmailOtp.findOne({ user: userId, purpose, usedAt: null })
    .select('+codeHash +salt');

  if (!record) {
    throw AppError.badRequest('رمز غير صحيح أو منتهي', {
      code: ERROR_CODES.INVALID_TOKEN,
    });
  }

  const now = new Date();
  if (record.expiresAt <= now) {
    throw AppError.badRequest('انتهت صلاحية الرمز، اطلب رمزًا جديدًا', {
      code: ERROR_CODES.TOKEN_EXPIRED,
    });
  }

  if (record.attempts >= env.otp.maxAttempts) {
    // Burn it so the attacker cannot keep trying.
    await EmailOtp.updateOne({ _id: record._id }, { $set: { usedAt: now } });
    throw AppError.badRequest('تم تجاوز الحد المسموح من المحاولات، اطلب رمزًا جديدًا', {
      code: ERROR_CODES.TOKEN_ALREADY_USED,
    });
  }

  const expected = hashCode(record.salt, String(code).trim());
  if (expected !== record.codeHash) {
    // Increment attempts; if this was the last allowed try, burn it.
    const attempts = record.attempts + 1;
    const burn = attempts >= env.otp.maxAttempts;
    await EmailOtp.updateOne(
      { _id: record._id },
      { $set: { attempts, ...(burn ? { usedAt: now } : {}) } },
    );
    throw AppError.badRequest('الرمز غير صحيح', { code: ERROR_CODES.INVALID_TOKEN });
  }

  // Atomic single-use claim.
  const claimed = await EmailOtp.findOneAndUpdate(
    { _id: record._id, usedAt: null },
    { $set: { usedAt: now } },
    { new: true },
  );
  if (!claimed) {
    throw AppError.badRequest('تم استخدام هذا الرمز بالفعل', {
      code: ERROR_CODES.TOKEN_ALREADY_USED,
    });
  }

  return { ok: true, userId: record.user };
};

/**
 * Helper used by tests: create a code without sending email, return raw code.
 */
export const createOtpForTests = async (userId, purpose) => issueOtp(userId, purpose);

export default { issueOtp, consumeOtp, createOtpForTests };
