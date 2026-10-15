import { Router } from 'express';
import { z } from 'zod';
import adminController from '../controllers/adminController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import validate from '../middleware/validateMiddleware.js';

const router = Router();

// Every /admin route requires an authenticated ADMIN.
router.use(authMiddleware, adminMiddleware);

const idParamSchema = z
  .object({ id: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'invalid id format') })
  .strict();

const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const setUserActiveSchema = z
  .object({ isActive: z.boolean({ required_error: 'isActive must be a boolean' }) })
  .strict();

const auditLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    action: z.string().trim().max(100).optional(),
  })
  .strict();

router.get('/stats', adminController.getStats);

router.get('/users', validate({ query: listUsersQuerySchema }), adminController.listUsers);

router.patch(
  '/users/:id',
  validate({ params: idParamSchema, body: setUserActiveSchema }),
  adminController.setUserActive,
);

router.get(
  '/audit-logs',
  validate({ query: auditLogsQuerySchema }),
  adminController.listAuditLogs,
);

export default router;
