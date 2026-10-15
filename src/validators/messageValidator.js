import { z } from 'zod';

const objectId = z
  .string({ required_error: 'id is required' })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'invalid id format');

const booleanFlag = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

/** POST /messages/:username */
export const sendMessageParamsSchema = z
  .object({
    username: z
      .string({ required_error: 'username is required' })
      .trim()
      .min(3, 'invalid username')
      .max(30, 'invalid username')
      .regex(/^[a-zA-Z0-9_]+$/, 'invalid username format')
      .transform((v) => v.toLowerCase()),
  })
  .strict();

export const sendMessageSchema = z
  .object({
    content: z
      .string({ required_error: 'content is required' })
      .trim()
      .min(1, 'message cannot be empty')
      .max(2000, 'message cannot exceed 2000 characters'),
  })
  .strict();

/** GET /messages — cursor pagination + whitelisted filters. */
export const listMessagesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{10,64}$/, 'invalid cursor')
      .optional(),
    isRead: booleanFlag.optional(),
    isArchived: booleanFlag.optional(),
  })
  .strict();

/** Path param shared by /messages/:id endpoints. */
export const messageIdParamSchema = z.object({ id: objectId }).strict();

/** PATCH /messages/:id/archive — body toggles the archived state. */
export const archiveMessageSchema = z
  .object({
    archived: z.boolean().default(true),
  })
  .strict();

export default {
  sendMessageParamsSchema,
  sendMessageSchema,
  listMessagesQuerySchema,
  messageIdParamSchema,
  archiveMessageSchema,
};
