import { ROLES } from '../constants/roles.js';
import AppError from '../utils/AppError.js';

/**
 * Admin-only guard.
 * MUST be used after authMiddleware. The role is read from the user document
 * that was loaded from the DB, never from client-provided fields or stale
 * token claims.
 */
export default function adminMiddleware(req, res, next) {
  if (!req.user) {
    return next(AppError.unauthenticated());
  }

  if (req.user.role !== ROLES.ADMIN) {
    return next(AppError.forbidden('Administrator privileges are required'));
  }

  next();
}
