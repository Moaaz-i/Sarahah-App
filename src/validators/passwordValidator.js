import { z } from 'zod';

/**
 * POST /password/forgot — send a 6-digit OTP to the account email.
 * Always answers 202 whether or not the account exists (no enumeration).
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

/** POST /password/reset — verify the OTP and set the new password. */
export const resetPasswordSchema = z
  .object({
    email: z
      .string({ required_error: 'email is required' })
      .trim()
      .email('invalid email format')
      .transform((v) => v.toLowerCase()),
    otp: z
      .string({ required_error: 'otp is required' })
      .trim()
      .regex(/^\d{6}$/, 'otp must be a 6-digit code'),
    newPassword: z
      .string({ required_error: 'newPassword is required' })
      .min(8, 'newPassword must be at least 8 characters')
      .max(72, 'newPassword cannot exceed 72 characters')
      .regex(/[A-Za-z]/, 'newPassword must contain at least one letter')
      .regex(/[0-9]/, 'newPassword must contain at least one number'),
  })
  .strict();

export default { forgotPasswordSchema, resetPasswordSchema };
