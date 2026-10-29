import { Router } from 'express';
import { z } from 'zod';
import adminController from '../controllers/adminController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import validate from '../middleware/validateMiddleware.js';

const router = Router();

// Every /admin route requires an authenticated ADMIN.
router.use(authMiddleware, adminMiddleware);

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'invalid id format');

const idParamSchema = z.object({ id: objectId }).strict();

const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    role: z.enum(['user', 'admin']).optional(),
  })
  .strict();

const setUserActiveSchema = z
  .object({ isActive: z.boolean({ required_error: 'isActive must be a boolean' }) })
  .strict();

const setUserRoleSchema = z
  .object({
    role: z.enum(['user', 'admin'], { required_error: 'role must be user or admin' }),
  })
  .strict();

const resetPasswordSchema = z
  .object({
    newPassword: z
      .string({ required_error: 'newPassword is required' })
      .min(8, 'newPassword must be at least 8 characters')
      .max(72, 'newPassword cannot exceed 72 characters')
      .regex(/[A-Za-z]/, 'newPassword must contain at least one letter')
      .regex(/[0-9]/, 'newPassword must contain at least one number'),
  })
  .strict();

const listReportsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['pending', 'reviewed', 'dismissed']).optional(),
  })
  .strict();

const updateReportSchema = z
  .object({
    status: z.enum(['pending', 'reviewed', 'dismissed'], {
      required_error: 'status is required',
    }),
  })
  .strict();

const auditLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    action: z.string().trim().max(100).optional(),
  })
  .strict();

// ---- stats
router.get('/stats', adminController.getStats);

// ---- users
router.get('/users', validate({ query: listUsersQuerySchema }), adminController.listUsers);

router.get('/users/:id', validate({ params: idParamSchema }), adminController.getUserById);

router.patch(
  '/users/:id',
  validate({ params: idParamSchema, body: setUserActiveSchema }),
  adminController.setUserActive,
);

router.patch(
  '/users/:id/role',
  validate({ params: idParamSchema, body: setUserRoleSchema }),
  adminController.setUserRole,
);

router.patch(
  '/users/:id/password',
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  adminController.resetUserPassword,
);

router.delete('/users/:id', validate({ params: idParamSchema }), adminController.deleteUser);

router.post(
  '/users/:id/revoke-sessions',
  validate({ params: idParamSchema }),
  adminController.revokeUserSessions,
);

// ---- reports
router.get('/reports', validate({ query: listReportsQuerySchema }), adminController.listReports);

router.patch(
  '/reports/:id',
  validate({ params: idParamSchema, body: updateReportSchema }),
  adminController.updateReportStatus,
);

// ---- audit logs
router.get(
  '/audit-logs',
  validate({ query: auditLogsQuerySchema }),
  adminController.listAuditLogs,
);

// ---- system & redis health
router.get('/system', adminController.getSystemHealth);
router.post('/system/flush-cache', adminController.flushSystemCache);

export default router;
