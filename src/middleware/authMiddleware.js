import { verifyAccessToken } from '../utils/generateToken.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import * as redisService from '../services/redisService.js';

/**
 * Mandatory authentication.
 * - Accepts "Authorization: Bearer <access token>".
 * - Verifies signature, algorithm, issuer, audience and expiry.
 * - Checks Redis token blacklist (single-device logout / revoke token).
 * - Checks Redis / DB session revocation (logout from all devices).
 * - Loads the user and rejects disabled/deleted accounts.
 * - Rejects with 401 for anything invalid; never treats a bad token as
 *   an anonymous request.
 */
export default async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      throw AppError.unauthenticated('Missing Bearer access token');
    }

    const token = header.slice(7).trim();
    if (!token) throw AppError.unauthenticated('Missing Bearer access token');

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      if (err?.name === 'TokenExpiredError') {
        throw AppError.unauthenticated('Access token has expired', ERROR_CODES.TOKEN_EXPIRED);
      }
      throw AppError.unauthenticated('Invalid access token', ERROR_CODES.INVALID_TOKEN);
    }

    // Check token blacklist in Redis (for specific revoked tokens / logout from current device)
    const blacklisted = await redisService.isTokenBlacklisted(token);
    if (blacklisted) {
      throw AppError.unauthenticated('Token has been revoked', ERROR_CODES.TOKEN_REVOKED);
    }

    // Check all-devices revocation in Redis
    const isRevoked = await redisService.isUserTokensRevoked(payload.sub, payload.iat);
    if (isRevoked) {
      throw AppError.unauthenticated('Session has expired, please log in again', ERROR_CODES.SESSION_EXPIRED);
    }

    const user = await User.findById(payload.sub).select('+deletedAt');
    if (!user) throw AppError.unauthenticated('User no longer exists');

    if (!user.isAccountActive()) {
      throw AppError.unauthenticated('This account is disabled', ERROR_CODES.ACCOUNT_DISABLED);
    }

    // Fallback DB check for all-device logout (in case Redis was flushed or expired)
    if (user.tokensRevokedAt && payload.iat) {
      const revokedSec = Math.floor(user.tokensRevokedAt.getTime() / 1000);
      if (payload.iat <= revokedSec) {
        throw AppError.unauthenticated('Session has expired, please log in again', ERROR_CODES.SESSION_EXPIRED);
      }
    }

    req.user = user;
    req.token = token;
    req.tokenPayload = payload;
    next();
  } catch (err) {
    next(err);
  }
}
