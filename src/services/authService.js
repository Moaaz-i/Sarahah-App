import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import { ROLES } from '../constants/roles.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import env from '../config/env.js';
import jwt from 'jsonwebtoken';
import * as tokenService from './tokenService.js';
import * as redisService from './redisService.js';
import * as otpService from './otpService.js';
import { sendMail } from '../utils/mailer.js';
import { twoFactorEnableTemplate, twoFactorLoginTemplate } from '../utils/emailTemplates.js';

/** Audit retention: 1 year. */
const auditRetention = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

/**
 * Register a new account.
 * - role is forced to "user": it is never read from the request.
 * - Uniqueness is enforced both in the service (clear 409s) and by the
 *   unique indexes (race safety).
 */
export const register = async ({ name, username, email, password }, meta = {}) => {
  const normalizedUsername = String(username).toLowerCase().trim();
  const normalizedEmail = String(email).toLowerCase().trim();

  const [usernameTaken, emailTaken] = await Promise.all([
    User.exists({ username: normalizedUsername }),
    User.exists({ email: normalizedEmail }),
  ]);

  if (usernameTaken) throw AppError.conflict(ERROR_CODES.USERNAME_TAKEN);
  if (emailTaken) throw AppError.conflict(ERROR_CODES.EMAIL_TAKEN);

  const hashed = await bcrypt.hash(password, env.security.bcryptRounds);

  let user;
  try {
    user = await User.create({
      name,
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashed,
      role: ROLES.USER, // server-assigned, never from the client
      authProvider: 'local',
      isVerified: false,
      isActive: true,
    });
  } catch (err) {
    // Unique-index race: convert to the same 409 the checks above produce.
    if (err?.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      throw AppError.conflict(
        field === 'username' ? ERROR_CODES.USERNAME_TAKEN : ERROR_CODES.EMAIL_TAKEN,
      );
    }
    throw err;
  }

  await AuditLog.create({
    actor: user._id,
    action: 'auth.register',
    targetType: 'User',
    targetId: String(user._id),
    requestId: meta.requestId ?? null,
    metadata: { authProvider: 'local' },
    expiresAt: auditRetention(),
  });

  const tokens = await tokenService.issueTokens(user, meta);

  return { user: sanitizeUser(user), ...tokens };
};

const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local.slice(-1)}@${domain}`;
};

/**
 * Login with email or username.
 * - Enforces account ban for 5 minutes after 5 consecutive failed attempts.
 * - Dispatches 2-step verification OTP if enabled, otherwise returns tokens directly.
 */
export const login = async ({ identifier, password }, meta = {}) => {
  const value = String(identifier).toLowerCase().trim();

  const user = await User.findOne({
    $or: [{ email: value }, { username: value }],
  }).select('+password +deletedAt');

  const invalid = AppError.unauthenticated(
    'Invalid credentials',
    ERROR_CODES.INVALID_CREDENTIALS,
  );

  if (!user || !user.password) throw invalid;
  if (!user.isAccountActive()) {
    throw AppError.unauthenticated('This account is disabled', ERROR_CODES.ACCOUNT_DISABLED);
  }

  // 1. Check temporary ban from consecutive failed login attempts
  const now = new Date();
  if (user.bannedUntil && user.bannedUntil > now) {
    const remainingMs = user.bannedUntil.getTime() - now.getTime();
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    throw AppError.forbidden(
      `تم حظر الحساب مؤقتًا لمدة 5 دقائق بسبب 5 محاولات دخول خاطئة متتالية. يرجى المحاولة بعد ${remainingMinutes} دقيقة.`,
      'ACCOUNT_TEMPORARILY_BANNED',
    );
  }

  // If ban has expired, reset counter and clear ban
  if (user.bannedUntil && user.bannedUntil <= now) {
    user.bannedUntil = null;
    user.failedLoginAttempts = 0;
  }

  // 2. Validate password
  const matches = await bcrypt.compare(password, user.password);
  if (!matches) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= 5) {
      user.bannedUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes ban
      user.failedLoginAttempts = 0;
      await user.save();
      throw AppError.forbidden(
        'تم حظر الحساب مؤقتًا لمدة 5 دقائق بسبب 5 محاولات دخول خاطئة متتالية.',
        'ACCOUNT_TEMPORARILY_BANNED',
      );
    }
    await user.save();
    throw invalid;
  }

  // 3. Password correct: reset failed login attempts counter
  user.failedLoginAttempts = 0;
  user.bannedUntil = null;

  // 4. Check if 2-step verification is enabled
  if (user.twoFactorEnabled) {
    if (!user.email) {
      throw AppError.badRequest('لا يوجد بريد إلكتروني مرتبط بهذا الحساب لاستلام رمز التحقق');
    }

    const code = await otpService.issueOtp(user._id, 'two_factor_login');
    const { subject, html, text } = twoFactorLoginTemplate(
      user.name,
      code,
      env.otp.ttlMinutes,
    );
    await sendMail({ to: user.email, subject, html, text });

    const loginTicket = jwt.sign(
      { sub: String(user._id), purpose: 'two_factor_login' },
      env.jwt.accessSecret,
      { expiresIn: '5m' },
    );

    await user.save();

    return {
      requiresTwoFactor: true,
      userId: String(user._id),
      loginTicket,
      email: maskEmail(user.email),
      message: 'تم إرسال رمز التحقق بخطوتين إلى بريدك الإلكتروني بنجاح',
    };
  }

  // If 2-step-verification is disabled: issue tokens directly without extra steps
  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await tokenService.issueTokens(user, meta);
  return { user: sanitizeUser(user), ...tokens };
};

/**
 * Confirm login with 2-step verification OTP.
 */
export const loginConfirm = async ({ userId, loginTicket, identifier, code }, meta = {}) => {
  let resolvedUserId = userId;

  if (loginTicket) {
    try {
      const decoded = jwt.verify(loginTicket, env.jwt.accessSecret);
      if (decoded.purpose !== 'two_factor_login' || !decoded.sub) {
        throw new Error();
      }
      resolvedUserId = decoded.sub;
    } catch {
      throw AppError.unauthenticated(
        'تذكرة التحقق منتهية أو غير صحيحة، يرجى إعادة تسجيل الدخول',
        ERROR_CODES.INVALID_TOKEN,
      );
    }
  }

  let user = null;
  if (resolvedUserId) {
    user = await User.findById(resolvedUserId).select('+deletedAt');
  } else if (identifier) {
    const value = String(identifier).toLowerCase().trim();
    user = await User.findOne({
      $or: [{ email: value }, { username: value }],
    }).select('+deletedAt');
  }

  if (!user || !user.isAccountActive()) {
    throw AppError.unauthenticated('المستخدم غير موجود أو حسابه معطل');
  }

  // Verify and consume OTP
  await otpService.consumeOtp(user._id, 'two_factor_login', code);

  user.lastLoginAt = new Date();
  await user.save();

  await AuditLog.create({
    actor: user._id,
    action: 'auth.login_2fa',
    targetType: 'User',
    targetId: String(user._id),
    requestId: meta.requestId ?? null,
    metadata: { authProvider: user.authProvider || 'local' },
    expiresAt: auditRetention(),
  });

  const tokens = await tokenService.issueTokens(user, meta);
  return { user: sanitizeUser(user), ...tokens };
};

/**
 * Request OTP to enable 2-step verification.
 */
export const sendTwoFactorEnableOtp = async (user) => {
  if (!user.email) {
    throw AppError.badRequest('يرجى ربط بريد إلكتروني بالحساب أولاً لتفعيل التحقق بخطوتين');
  }

  const code = await otpService.issueOtp(user._id, 'two_factor_enable');
  const { subject, html, text } = twoFactorEnableTemplate(
    user.name,
    code,
    env.otp.ttlMinutes,
  );
  const result = await sendMail({ to: user.email, subject, html, text });

  return {
    sent: result.sent,
    skipped: result.skipped,
    expiresInMinutes: env.otp.ttlMinutes,
    message: 'تم إرسال رمز التحقق لتفعيل التحقق بخطوتين إلى بريدك الإلكتروني',
  };
};

/**
 * Verify OTP and enable 2-step verification.
 */
export const verifyAndEnableTwoFactor = async (user, code) => {
  await otpService.consumeOtp(user._id, 'two_factor_enable', code);

  user.twoFactorEnabled = true;
  await user.save();

  await AuditLog.create({
    actor: user._id,
    action: 'auth.2fa_enabled',
    targetType: 'User',
    targetId: String(user._id),
    expiresAt: auditRetention(),
  });

  return {
    twoFactorEnabled: true,
    user: sanitizeUser(user),
    message: 'تم تفعيل التحقق بخطوتين بنجاح على حسابك 🛡️',
  };
};

/**
 * Disable 2-step verification.
 */
export const disableTwoFactor = async (user) => {
  user.twoFactorEnabled = false;
  await user.save();

  await AuditLog.create({
    actor: user._id,
    action: 'auth.2fa_disabled',
    targetType: 'User',
    targetId: String(user._id),
    expiresAt: auditRetention(),
  });

  return {
    twoFactorEnabled: false,
    user: sanitizeUser(user),
    message: 'تم تعطيل التحقق بخطوتين بنجاح',
  };
};

/** Rotate a refresh token into a fresh access + refresh pair. */
export const refresh = (body, meta = {}) =>
  tokenService.rotateRefreshToken(body.refreshToken, meta);

/**
 * Logout from one device (revokes current refresh token + blacklists access token in Redis).
 */
export const logout = async (user, options = {}) => {
  const refreshToken = typeof options === 'string' ? options : options?.refreshToken;
  const accessToken = typeof options === 'object' ? options?.accessToken : undefined;
  const tokenPayload = typeof options === 'object' ? options?.tokenPayload : undefined;
  const requestId = typeof options === 'object' ? options?.requestId : undefined;

  if (refreshToken) {
    await tokenService.revokeRefreshToken(refreshToken);
  }

  if (accessToken) {
    const remainingSec = tokenPayload?.exp
      ? Math.max(1, Math.floor(tokenPayload.exp - Date.now() / 1000))
      : 900;
    await redisService.blacklistToken(accessToken, remainingSec);
  }

  await AuditLog.create({
    actor: user._id,
    action: 'auth.logout',
    targetType: 'User',
    targetId: String(user._id),
    requestId: requestId ?? null,
    metadata: { scope: 'single_device' },
    expiresAt: auditRetention(),
  });

  return { loggedOut: true, scope: 'device' };
};

/**
 * Logout from ALL devices (revokes all refresh tokens, marks revocation in Redis and DB, blacklists access token).
 */
export const logoutAll = async (user, options = {}) => {
  const accessToken = typeof options === 'object' ? options?.accessToken : undefined;
  const tokenPayload = typeof options === 'object' ? options?.tokenPayload : undefined;
  const requestId = typeof options === 'object' ? options?.requestId : undefined;

  // Revoke all refresh tokens in DB
  await tokenService.revokeAllForUser(user._id, { reason: 'logout_all' });

  // Update DB revocation timestamp
  user.tokensRevokedAt = new Date();
  await user.save();

  // Set Redis all-device revocation
  await redisService.revokeAllUserTokens(user._id);

  // Blacklist current access token in Redis
  if (accessToken) {
    const remainingSec = tokenPayload?.exp
      ? Math.max(1, Math.floor(tokenPayload.exp - Date.now() / 1000))
      : 900;
    await redisService.blacklistToken(accessToken, remainingSec);
  }

  await AuditLog.create({
    actor: user._id,
    action: 'auth.logout_all',
    targetType: 'User',
    targetId: String(user._id),
    requestId: requestId ?? null,
    metadata: { scope: 'all_devices' },
    expiresAt: auditRetention(),
  });

  return { loggedOut: true, scope: 'all' };
};

/** Current authenticated user, sanitized. */
export const me = (user) => ({ user: sanitizeUser(user) });

export default {
  register,
  login,
  loginConfirm,
  sendTwoFactorEnableOtp,
  verifyAndEnableTwoFactor,
  disableTwoFactor,
  refresh,
  logout,
  logoutAll,
  me,
};
