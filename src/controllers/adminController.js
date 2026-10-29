import asyncHandler from '../utils/asyncHandler.js';
import * as adminService from '../services/adminService.js';

/** GET /api/v1/admin/users — admins only. */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, search, role } = req.query;
  const result = await adminService.listUsers(req.user, { page, limit, search, role });
  res.status(200).json({ success: true, message: 'Users fetched successfully', data: result });
});

/** GET /api/v1/admin/users/:id */
export const getUserById = asyncHandler(async (req, res) => {
  const result = await adminService.getUserById(req.user, req.params.id);
  res.status(200).json({ success: true, message: 'User fetched successfully', data: result });
});

/** PATCH /api/v1/admin/users/:id — enable/disable an account. */
export const setUserActive = asyncHandler(async (req, res) => {
  const result = await adminService.setUserActive(req.user, req.params.id, req.body.isActive, {
    requestId: req.requestId,
  });
  res.status(200).json({
    success: true,
    message: req.body.isActive ? 'Account enabled' : 'Account disabled',
    data: result,
  });
});

/** PATCH /api/v1/admin/users/:id/role — change a user's role. */
export const setUserRole = asyncHandler(async (req, res) => {
  const result = await adminService.setUserRole(req.user, req.params.id, req.body.role, {
    requestId: req.requestId,
  });
  res.status(200).json({ success: true, message: 'Role updated', data: result });
});

/** PATCH /api/v1/admin/users/:id/password — reset a user's password. */
export const resetUserPassword = asyncHandler(async (req, res) => {
  const result = await adminService.resetUserPassword(req.user, req.params.id, req.body.newPassword, {
    requestId: req.requestId,
  });
  res.status(200).json({
    success: true,
    message: 'Password reset, all sessions revoked',
    data: result,
  });
});

/** DELETE /api/v1/admin/users/:id — permanently delete a user + content. */
export const deleteUser = asyncHandler(async (req, res) => {
  const result = await adminService.deleteUser(req.user, req.params.id, {
    requestId: req.requestId,
  });
  res.status(200).json({ success: true, message: 'User deleted', data: result });
});

/** GET /api/v1/admin/reports */
export const listReports = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query;
  const result = await adminService.listReports(req.user, { page, limit, status });
  res.status(200).json({ success: true, message: 'Reports fetched', data: result });
});

/** PATCH /api/v1/admin/reports/:id */
export const updateReportStatus = asyncHandler(async (req, res) => {
  const result = await adminService.updateReportStatus(req.user, req.params.id, req.body.status, {
    requestId: req.requestId,
  });
  res.status(200).json({ success: true, message: 'Report updated', data: result });
});

/** GET /api/v1/admin/audit-logs */
export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, action } = req.query;
  const result = await adminService.listAuditLogs(req.user, { page, limit, action });
  res.status(200).json({
    success: true,
    message: 'Audit logs fetched successfully',
    data: result,
  });
});

/** POST /api/v1/admin/users/:id/revoke-sessions */
export const revokeUserSessions = asyncHandler(async (req, res) => {
  const result = await adminService.revokeUserSessions(req.user, req.params.id, {
    requestId: req.requestId,
  });
  res.status(200).json({ success: true, message: 'All user sessions revoked successfully', data: result });
});

/** GET /api/v1/admin/stats */
export const getStats = asyncHandler(async (req, res) => {
  const result = await adminService.getStats(req.user);
  res.status(200).json({ success: true, message: 'Stats fetched successfully', data: result });
});

/** GET /api/v1/admin/system */
export const getSystemHealth = asyncHandler(async (req, res) => {
  const result = await adminService.getSystemHealth(req.user);
  res.status(200).json({ success: true, message: 'System health fetched successfully', data: result });
});

/** POST /api/v1/admin/system/flush-cache */
export const flushSystemCache = asyncHandler(async (req, res) => {
  const result = await adminService.flushSystemCache(req.user, { requestId: req.requestId });
  res.status(200).json({ success: true, message: 'System cache flushed successfully', data: result });
});

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
