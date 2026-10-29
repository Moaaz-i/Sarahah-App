import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import { ROLES } from '../constants/roles.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import env from '../config/env.js';
import * as tokenService from './tokenService.js';
import * as redisService from './redisService.js';

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

/**
 * Login with email or username.
 * The failure message is intentionally identical whether the account
 * exists or not (prevents account enumeration).
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

  const matches = await bcrypt.compare(password, user.password);
  if (!matches) throw invalid;

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await tokenService.issueTokens(user, meta);
  return { user: sanitizeUser(user), ...tokens };
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

export default { register, login, refresh, logout, logoutAll, me };
