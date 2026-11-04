import { z } from 'zod';

const objectId = (field = 'id') =>
  z
    .string({ required_error: `${field} is required` })
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, `invalid ${field} format`);

export const createIdentityRequestSchema = z
  .object({
    messageId: objectId('messageId'),
  })
  .strict();

export const listRequestsQuerySchema = z
  .object({
    status: z.enum(['pending', 'accepted', 'rejected']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const requestIdParamSchema = z
  .object({
    id: objectId('id'),
  })
  .strict();

export const messageIdParamSchema = z
  .object({
    messageId: objectId('messageId'),
  })
  .strict();

export const respondRequestSchema = z
  .object({
    action: z.enum(['accept', 'reject'], {
      errorMap: () => ({ message: 'action must be either "accept" or "reject"' }),
    }),
  })
  .strict();

