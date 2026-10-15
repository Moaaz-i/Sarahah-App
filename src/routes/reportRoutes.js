import { Router } from 'express';
import reportController from '../controllers/reportController.js';
import optionalAuthMiddleware from '../middleware/optionalAuthMiddleware.js';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import validate from '../middleware/validateMiddleware.js';
import { reportLimiter } from '../middleware/rateLimitMiddleware.js';
import {
  createReportSchema,
  listReportsQuerySchema,
  updateReportStatusSchema,
  reportIdParamSchema,
} from '../validators/reportValidator.js';

const router = Router();

// POST /api/v1/reports — anonymous visitors and logged-in users may report.
router.post(
  '/',
  reportLimiter(),
  optionalAuthMiddleware,
  validate({ body: createReportSchema }),
  reportController.createReport,
);

// Admin-only review endpoints.
router.get(
  '/',
  authMiddleware,
  adminMiddleware,
  validate({ query: listReportsQuerySchema }),
  reportController.listReports,
);

router.get(
  '/:id',
  authMiddleware,
  adminMiddleware,
  validate({ params: reportIdParamSchema }),
  reportController.getReport,
);

router.patch(
  '/:id/status',
  authMiddleware,
  adminMiddleware,
  validate({ params: reportIdParamSchema, body: updateReportStatusSchema }),
  reportController.updateReportStatus,
);

export default router;
