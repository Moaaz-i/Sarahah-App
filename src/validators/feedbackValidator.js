import { z } from 'zod';
import { MESSAGE_CATEGORY_VALUES, GOAL_STATUS_VALUES } from '../constants/feedback.js';

/** PUT /reception — partial update of the recipient's own policy. */
export const updateReceptionSchema = z
  .object({
    isPaused: z.boolean().optional(),
    pauseReason: z.string().trim().max(200, 'pauseReason cannot exceed 200 characters').optional(),
    allowedCategories: z
      .array(
        z.enum(MESSAGE_CATEGORY_VALUES, {
          errorMap: () => ({
            message: `category must be one of: ${MESSAGE_CATEGORY_VALUES.join(', ')}`,
          }),
        }),
      )
      .max(MESSAGE_CATEGORY_VALUES.length, 'unknown categories')
      .optional(),
    policyMessage: z.string().trim().max(400, 'policyMessage cannot exceed 400 characters').optional(),
    requireCategory: z.boolean().optional(),
    enableShield: z.boolean().optional(),
    quarantineFlagged: z.boolean().optional(),
  })
  .strict();

/** PUT /reception/prompts — wholesale replace of the published prompt list. */
export const replacePromptsSchema = z
  .object({
    prompts: z
      .array(
        z
          .object({
            text: z
              .string({ required_error: 'prompt text is required' })
              .trim()
              .min(3, 'prompt text must be at least 3 characters')
              .max(160, 'prompt text cannot exceed 160 characters'),
            isActive: z.boolean().default(true),
          })
          .strict(),
      )
      .max(6, 'you can publish at most 6 prompts'),
  })
  .strict();

/** GET /mirror?period= */
export const mirrorQuerySchema = z
  .object({
    period: z.enum(['30d', '90d', 'all']).default('30d'),
  })
  .strict();

/** POST /goals */
export const createGoalSchema = z
  .object({
    messageId: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]{24}$/, 'invalid id format')
      .optional()
      .nullable(),
    note: z
      .string({ required_error: 'note is required' })
      .trim()
      .min(1, 'goal note cannot be empty')
      .max(600, 'goal note cannot exceed 600 characters'),
    action: z.string().trim().max(600, 'action cannot exceed 600 characters').default(''),
    /**
     * Validated in the service, not here: `z.coerce.date()` would silently
     * turn a null/empty value into 1970-01-01 instead of treating it as "none".
     */
    reviewAt: z.unknown().optional(),
  })
  .strict();

/** PATCH /goals/:id — every field optional, nothing is required. */
export const updateGoalSchema = z
  .object({
    note: z.string().trim().min(1).max(600).optional(),
    action: z.string().trim().max(600).optional(),
    reflection: z.string().trim().max(1200).optional(),
    rating: z.coerce.number().int().min(0).max(5).optional(),
    reviewAt: z.unknown().optional(),
    status: z.enum(GOAL_STATUS_VALUES, {
      errorMap: () => ({ message: `status must be one of: ${GOAL_STATUS_VALUES.join(', ')}` }),
    }).optional(),
  })
  .strict();

/** GET /goals */
export const listGoalsQuerySchema = z
  .object({
    status: z.enum(GOAL_STATUS_VALUES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

/** Path param shared by /goals/:id endpoints. */
export const goalIdParamSchema = z
  .object({
    id: z
      .string({ required_error: 'id is required' })
      .trim()
      .regex(/^[0-9a-fA-F]{24}$/, 'invalid id format'),
  })
  .strict();

export default {
  updateReceptionSchema,
  replacePromptsSchema,
  mirrorQuerySchema,
  createGoalSchema,
  updateGoalSchema,
  listGoalsQuerySchema,
  goalIdParamSchema,
};
