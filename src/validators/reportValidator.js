import { z } from 'zod';
import { REPORT_REASONS, REPORT_STATUSES } from '../constants/reportReasons.js';

const objectId = z
  .string({ required_error: 'messageId is required' })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'invalid messageId format');

/** POST /reports */
export const createReportSchema = z
  .object({
    messageId: objectId,
    reason: z.enum(REPORT_REASONS, {
      errorMap: () => ({ message: `reason must be one of: ${REPORT_REASONS.join(', ')}` }),
    }),
    details: z.string().trim().max(1000, 'details cannot exceed 1000 characters').optional(),
  })
  .strict();

/** GET /reports (admin) — filtered, paginated. */
export const listReportsQuerySchema = z
  .object({
    status: z.enum(REPORT_STATUSES).optional(),
    reason: z.enum(REPORT_REASONS).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/** PATCH /reports/:id/status (admin) */
export const updateReportStatusSchema = z
  .object({
    status: z.enum(REPORT_STATUSES, {
      errorMap: () => ({ message: `status must be one of: ${REPORT_STATUSES.join(', ')}` }),
    }),
  })
  .strict();

export const reportIdParamSchema = z
  .object({
    id: z
      .string({ required_error: 'id is required' })
      .trim()
      .regex(/^[0-9a-fA-F]{24}$/, 'invalid id format'),
  })
  .strict();

export default {
  createReportSchema,
  listReportsQuerySchema,
  updateReportStatusSchema,
  reportIdParamSchema,
};
