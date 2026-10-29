import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import Message from '../models/Message.js';
import Report from '../models/Report.js';
import EmailOtp from '../models/EmailOtp.js';
import AppError from '../utils/AppError.js';
import { pageMeta } from '../utils/pagination.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import { ROLES } from '../constants/roles.js';
import env from '../config/env.js';
import { revokeAllForUser } from './tokenService.js';
import * as redisService from './redisService.js';
import mongoose from 'mongoose';

/**
 * Admin service: operational views + account & content management.
 * Every function asserts the actor is an admin (defence in depth, the route
 * already enforces it through adminMiddleware).
 */

const auditRetention = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

const assertAdmin = (admin) => {
  if (!admin || admin.role !== ROLES.ADMIN) {
    throw AppError.forbidden('Administrator privileges are required');
  }
};

/** Paginated user list (sanitized, with search & role filter). */
export const listUsers = async (admin, { page = 1, limit = 20, search = '', role = '' } = {}) => {
  assertAdmin(admin);

  const query = {};
  if (role && (role === 'user' || role === 'admin')) {
    query.role = role;
  }
  if (search && String(search).trim()) {
    const clean = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { username: { $regex: clean, $options: 'i' } },
      { name: { $regex: clean, $options: 'i' } },
      { email: { $regex: clean, $options: 'i' } },
    ];
  }

  const [total, users] = await Promise.all([
    User.countDocuments(query),
    User.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  return {
    users: users.map((u) => sanitizeUser(u)),
    pagination: pageMeta({ page, limit, total }),
  };
};

/** Single user by id (sanitized). */
export const getUserById = async (admin, userId) => {
  assertAdmin(admin);
  const user = await User.findById(userId).select('+deletedAt');
  if (!user) throw AppError.notFound('User not found');
  return { user: sanitizeUser(user) };
};

/** Enable or disable an account. */
export const setUserActive = async (admin, userId, isActive, { requestId = null } = {}) => {
  assertAdmin(admin);

  const user = await User.findById(userId).select('+deletedAt');
  if (!user || user.deletedAt) throw AppError.notFound('User not found');

  if (String(user._id) === String(admin._id)) {
    throw AppError.badRequest('You cannot disable your own account');
  }

  user.isActive = Boolean(isActive);
  await user.save();

  // When disabling, also revoke every session immediately.
  if (!isActive) await revokeAllForUser(user._id, { reason: 'admin_disabled' });

  await AuditLog.create({
    actor: admin._id,
    action: isActive ? 'admin.user_enabled' : 'admin.user_disabled',
    targetType: 'User',
    targetId: String(user._id),
    requestId,
    metadata: { username: user.username },
    expiresAt: auditRetention(),
  });

  return { user: sanitizeUser(user) };
};

/** Change a user's role (user <-> admin). Cannot demote yourself. */
export const setUserRole = async (admin, userId, role, { requestId = null } = {}) => {
  assertAdmin(admin);

  if (!Object.values(ROLES).includes(role)) {
    throw AppError.badRequest('Invalid role');
  }

  const user = await User.findById(userId).select('+deletedAt');
  if (!user || user.deletedAt) throw AppError.notFound('User not found');

  if (String(user._id) === String(admin._id)) {
    throw AppError.badRequest('You cannot change your own role');
  }

  const previousRole = user.role;
  user.role = role;
  await user.save();

  await AuditLog.create({
    actor: admin._id,
    action: 'admin.user_role_changed',
    targetType: 'User',
    targetId: String(user._id),
    requestId,
    metadata: { username: user.username, from: previousRole, to: role },
    expiresAt: auditRetention(),
  });

  return { user: sanitizeUser(user) };
};

/** Reset a user's password (admin action). Revokes all sessions. */
export const resetUserPassword = async (admin, userId, newPassword, { requestId = null } = {}) => {
  assertAdmin(admin);

  const user = await User.findById(userId).select('+deletedAt');
  if (!user || user.deletedAt) throw AppError.notFound('User not found');

  user.password = await bcrypt.hash(newPassword, env.security.bcryptRounds);
  await user.save();

  await revokeAllForUser(user._id, { reason: 'admin_password_reset' });

  await AuditLog.create({
    actor: admin._id,
    action: 'admin.user_password_reset',
    targetType: 'User',
    targetId: String(user._id),
    requestId,
    metadata: { username: user.username, sessionsRevoked: true },
    expiresAt: auditRetention(),
  });

  return { reset: true, sessionsRevoked: true };
};

/** Permanently delete a user (hard delete, cascades to their content). */
export const deleteUser = async (admin, userId, { requestId = null } = {}) => {
  assertAdmin(admin);

  const user = await User.findById(userId).select('+deletedAt');
  if (!user) throw AppError.notFound('User not found');

  if (String(user._id) === String(admin._id)) {
    throw AppError.badRequest('You cannot delete your own account here');
  }

  // Cascade: remove messages delivered to the user, reports on those messages or filed by the user, and OTPs.
  const userMessages = await Message.find({ recipient: user._id }).select('_id');
  const messageIds = userMessages.map((m) => m._id);

  const [msgResult, reportResult] = await Promise.all([
    Message.deleteMany({ recipient: user._id }),
    Report.deleteMany({
      $or: [
        { reporter: user._id },
        { message: { $in: messageIds } },
      ],
    }),
    EmailOtp.deleteMany({ user: user._id }),
    redisService.revokeAllUserTokens(user._id),
  ]);

  await revokeAllForUser(user._id, { reason: 'admin_deleted' });
  await User.deleteOne({ _id: user._id });

  await AuditLog.create({
    actor: admin._id,
    action: 'admin.user_deleted',
    targetType: 'User',
    targetId: String(user._id),
    requestId,
    metadata: {
      username: user.username,
      messagesDeleted: msgResult.deletedCount,
      reportsDeleted: reportResult.deletedCount,
    },
    expiresAt: auditRetention(),
  });

  return {
    deleted: true,
    messagesDeleted: msgResult.deletedCount,
    reportsDeleted: reportResult.deletedCount,
  };
};

/** Paginated reports list, optionally filtered by status. */
export const listReports = async (admin, { page = 1, limit = 20, status } = {}) => {
  assertAdmin(admin);

  const filter = status ? { status } : {};
  const [total, reports] = await Promise.all([
    Report.countDocuments(filter),
    Report.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('message', 'content type createdAt')
      .populate('reporter', 'username name')
      .populate('reviewedBy', 'username'),
  ]);

  return {
    reports: reports.map((r) => ({
      id: String(r._id),
      reason: r.reason,
      details: r.details,
      status: r.status,
      message: r.message
        ? { id: String(r.message._id), content: r.message.content, createdAt: r.message.createdAt }
        : null,
      reporter: r.reporter ? { username: r.reporter.username, name: r.reporter.name } : null,
      reviewedBy: r.reviewedBy ? { username: r.reviewedBy.username } : null,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    })),
    pagination: pageMeta({ page, limit, total }),
  };
};

/** Update a report's status (pending / reviewed / dismissed). */
export const updateReportStatus = async (admin, reportId, status, { requestId = null } = {}) => {
  assertAdmin(admin);

  const report = await Report.findById(reportId);
  if (!report) throw AppError.notFound('Report not found');

  report.status = status;
  report.reviewedBy = admin._id;
  report.reviewedAt = new Date();
  await report.save();

  await AuditLog.create({
    actor: admin._id,
    action: 'admin.report_updated',
    targetType: 'Report',
    targetId: String(report._id),
    requestId,
    metadata: { status },
    expiresAt: auditRetention(),
  });

  return { report: { id: String(report._id), status: report.status } };
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

  const [users, activeUsers, verifiedUsers, messages, reports, pendingReports] =
    await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isActive: true, deletedAt: null }),
      User.countDocuments({ isVerified: true, deletedAt: null }),
      Message.countDocuments({ isDeleted: false }),
      Report.countDocuments({}),
      Report.countDocuments({ status: 'pending' }),
    ]);

  return {
    stats: {
      users,
      activeUsers,
      verifiedUsers,
      messages,
      reports,
      pendingReports,
    },
  };
};

/** Remotely revoke all sessions of a user across all devices. */
export const revokeUserSessions = async (admin, userId, { requestId = null } = {}) => {
  assertAdmin(admin);
  const user = await User.findById(userId).select('+deletedAt');
  if (!user || user.deletedAt) throw AppError.notFound('User not found');

  user.tokensRevokedAt = new Date();
  await user.save();

  await revokeAllForUser(user._id, { reason: 'admin_revocation' });
  await redisService.revokeAllUserTokens(user._id);

  await AuditLog.create({
    actor: admin._id,
    action: 'admin.user_sessions_revoked',
    targetType: 'User',
    targetId: String(user._id),
    requestId,
    metadata: { targetUser: user.username },
    expiresAt: auditRetention(),
  });

  return { sessionsRevoked: true };
};

/** Realtime System and Redis Health Status */
export const getSystemHealth = async (admin) => {
  assertAdmin(admin);
  const redisPing = await redisService.ping();
  const mem = process.memoryUsage();
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';

  return {
    status: dbState === 1 && redisPing ? 'healthy' : 'degraded',
    database: dbStatus,
    redis: {
      status: redisPing ? 'connected' : 'unavailable',
      ping: redisPing,
    },
    uptime: Math.floor(process.uptime()),
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    nodeVersion: process.version,
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
  };
};

/** Flush system cache */
export const flushSystemCache = async (admin, { requestId = null } = {}) => {
  assertAdmin(admin);
  await redisService.flushAll();

  await AuditLog.create({
    actor: admin._id,
    action: 'admin.cache_flushed',
    targetType: 'System',
    targetId: 'redis',
    requestId,
    metadata: { flushedBy: admin.username },
    expiresAt: auditRetention(),
  });

  return { flushed: true };
};

export default {
  listUsers,
  getUserById,
  setUserActive,
  setUserRole,
  resetUserPassword,
  deleteUser,
  revokeUserSessions,
  listReports,
  updateReportStatus,
  listAuditLogs,
  getStats,
  getSystemHealth,
  flushSystemCache,
};
