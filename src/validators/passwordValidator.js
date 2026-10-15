import { z } from 'zod';

/**
 * POST /password/forgot — the body is still validated, but the endpoint is
 * disabled and answers 503 PASSWORD_RESET_DISABLED for every caller.
 */
export const forgotPasswordSchema = z
  .object({
    email: z
      .string({ required_error: 'email is required' })
      .trim()
      .min(5, 'invalid email')
      .max(254, 'email is too long')
      .email('invalid email format')
      .transform((v) => v.toLowerCase()),
  })
  .strict();

/** POST /password/reset */
export const resetPasswordSchema = z
  .object({
    token: z
      .string({ required_error: 'token is required' })
      .trim()
      .min(20, 'token is invalid')
      .max(512, 'token is invalid'),
    newPassword: z
      .string({ required_error: 'newPassword is required' })
      .min(8, 'newPassword must be at least 8 characters')
      .max(72, 'newPassword cannot exceed 72 characters')
      .regex(/[A-Za-z]/, 'newPassword must contain at least one letter')
      .regex(/[0-9]/, 'newPassword must contain at least one number'),
  })
  .strict();

export default { forgotPasswordSchema, resetPasswordSchema };
