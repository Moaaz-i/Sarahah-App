import { verifyAccessToken } from '../utils/generateToken.js';
import User from '../models/User.js';

/**
 * Optional authentication (public routes).
 * - No token  -> anonymous request (req.user stays undefined).
 * - Valid token -> req.user is populated with an ACTIVE user.
 * - Invalid/expired token -> the request continues as anonymous, but the
 *   token is NEVER accepted as a trusted identity (we do not fall back to
 *   any decoded claims). It also never throws, so public routes stay public.
 */
export default async function optionalAuthMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return next();

    const token = header.slice(7).trim();
    if (!token) return next();

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      // Invalid token: treat as anonymous. Never trust the claims.
      return next();
    }

    const user = await User.findById(payload.sub).select('+deletedAt');
    if (user?.isAccountActive()) {
      req.user = user;
    }

    next();
  } catch (err) {
    next(err);
  }
}
