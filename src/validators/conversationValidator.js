import { z } from 'zod';

const objectId = (field = 'id') =>
  z
    .string({ required_error: `${field} is required` })
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, `invalid ${field} format`);

export const conversationIdParamSchema = z
  .object({
    id: objectId('id'),
  })
  .strict();

export const sendConversationMessageSchema = z
  .object({
    content: z
      .string({ required_error: 'content is required' })
      .trim()
      .min(1, 'message cannot be empty')
      .max(2000, 'message cannot exceed 2000 characters'),
  })
  .strict();

export const listConversationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const listMessagesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .strict();

