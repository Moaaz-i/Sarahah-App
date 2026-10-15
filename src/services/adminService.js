import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import Message from '../models/Message.js';
import Report from '../models/Report.js';
import AppError from '../utils/AppError.js';
import { pageMeta } from '../utils/pagination.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import { ROLES } from '../constants/roles.js';

/**
 * Admin service: read-only operational views + account enable/disable.
 * Every function asserts the actor is an admin (defence in depth, the route
 * already enforces it through adminMiddleware).
 */

const assertAdmin = (admin) => {
  if (!admin || admin.role !== ROLES.ADMIN) {
    throw AppError.forbidden('Administrator privileges are required');
  }
};

/** Paginated user list (sanitized, no password, no deletedAt). */
export const listUsers = async (admin, { page = 1, limit = 20 } = {}) => {
  assertAdmin(admin);

  const [total, users] = await Promise.all([
    User.countDocuments({}),
    User.find({})
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  return {
    users: users.map((u) => sanitizeUser(u)),
    pagination: pageMeta({ page, limit, total }),
  };
};

/** Enable or disable an account (never used to change roles). */
export const setUserActive = async (admin, userId, isActive, { requestId = null } = {}) => {
  assertAdmin(admin);

  const user = await User.findById(userId).select('+deletedAt');
  if (!user || user.deletedAt) throw AppError.notFound('User not found');

  if (String(user._id) === String(admin._id)) {
    throw AppError.badRequest('You cannot disable your own account');
  }

  user.isActive = Boolean(isActive);
  await user.save();

  await AuditLog.create({
    actor: admin._id,
    action: isActive ? 'admin.user_enabled' : 'admin.user_disabled',
    targetType: 'User',
    targetId: String(user._id),
    requestId,
    metadata: { username: user.username },
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });

  return { user: sanitizeUser(user) };
};

/** Audit trail (admin only). Newest first, page/limit paginated. */
export const listAuditLogs = async (admin, { page = 1, limit = 20, action } = {}) => {
  assertAdmin(admin);

  const filter = action ? { action } : {};

  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actor', 'username role'),
  ]);

  return {
    logs: logs.map((log) => ({
      id: String(log._id),
      action: log.action,
      actor: log.actor ? { username: log.actor.username, role: log.actor.role } : null,
      targetType: log.targetType,
      targetId: log.targetId,
      requestId: log.requestId,
      metadata: log.metadata,
      createdAt: log.createdAt,
    })),
    pagination: pageMeta({ page, limit, total }),
  };
};

/** Lightweight instance statistics for the admin dashboard. */
export const getStats = async (admin) => {
  assertAdmin(admin);

  const [users, activeUsers, messages, reports, pendingReports] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true, deletedAt: null }),
    Message.countDocuments({ isDeleted: false }),
    Report.countDocuments({}),
    Report.countDocuments({ status: 'pending' }),
  ]);

  return {
    stats: { users, activeUsers, messages, reports, pendingReports },
  };
};

export default { listUsers, setUserActive, listAuditLogs, getStats };
