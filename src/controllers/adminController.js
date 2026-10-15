import asyncHandler from '../utils/asyncHandler.js';
import * as adminService from '../services/adminService.js';

/** GET /api/v1/admin/users — admins only. */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;

  const result = await adminService.listUsers(req.user, { page, limit });

  res.status(200).json({
    success: true,
    message: 'Users fetched successfully',
    data: result,
  });
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

/** GET /api/v1/admin/audit-logs — admins only. */
export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, action } = req.query;

  const result = await adminService.listAuditLogs(req.user, { page, limit, action });

  res.status(200).json({
    success: true,
    message: 'Audit logs fetched successfully',
    data: result,
  });
});

/** GET /api/v1/admin/stats */
export const getStats = asyncHandler(async (req, res) => {
  const result = await adminService.getStats(req.user);

  res.status(200).json({
    success: true,
    message: 'Stats fetched successfully',
    data: result,
  });
});

export default { listUsers, setUserActive, listAuditLogs, getStats };
