import { verifyAccessToken } from '../utils/generateToken.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';

/**
 * Mandatory authentication.
 * - Accepts "Authorization: Bearer <access token>".
 * - Verifies signature, algorithm, issuer, audience and expiry.
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

    const user = await User.findById(payload.sub).select('+deletedAt');
    if (!user) throw AppError.unauthenticated('User no longer exists');

    if (!user.isAccountActive()) {
      throw AppError.unauthenticated('This account is disabled', ERROR_CODES.ACCOUNT_DISABLED);
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
