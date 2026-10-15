import { z } from 'zod';

/** Shared primitives ------------------------------------------------------- */

const username = z
  .string({ required_error: 'username is required' })
  .trim()
  .min(3, 'username must be at least 3 characters')
  .max(30, 'username cannot exceed 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'username can only contain letters, numbers and underscores')
  .transform((v) => v.toLowerCase());

const email = z
  .string({ required_error: 'email is required' })
  .trim()
  .min(5, 'email is too short')
  .max(254, 'email is too long')
  .email('invalid email format')
  .transform((v) => v.toLowerCase());

/**
 * Password policy: 8-72 chars, at least one letter and one number.
 * 72 is the bcrypt input limit; longer passwords are rejected, not truncated.
 */
const password = z
  .string({ required_error: 'password is required' })
  .min(8, 'password must be at least 8 characters')
  .max(72, 'password cannot exceed 72 characters')
  .regex(/[A-Za-z]/, 'password must contain at least one letter')
  .regex(/[0-9]/, 'password must contain at least one number');

const name = z
  .string({ required_error: 'name is required' })
  .trim()
  .min(2, 'name must be at least 2 characters')
  .max(100, 'name cannot exceed 100 characters');

/** Schemas ----------------------------------------------------------------- */

/** NOTE: role / isActive / isVerified are intentionally NOT accepted here. */
export const registerSchema = z
  .object({
    name,
    username,
    email,
    password,
  })
  .strict();

export const loginSchema = z
  .object({
    identifier: z
      .string({ required_error: 'identifier is required' })
      .trim()
      .min(3, 'identifier must be at least 3 characters')
      .max(254, 'identifier is too long'),
    password: z
      .string({ required_error: 'password is required' })
      .min(1, 'password is required')
      .max(72, 'password cannot exceed 72 characters'),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z
      .string({ required_error: 'refreshToken is required' })
      .trim()
      .min(20, 'refreshToken is invalid')
      .max(512, 'refreshToken is invalid'),
  })
  .strict();

export const logoutSchema = z
  .object({
    refreshToken: z
      .string()
      .trim()
      .min(20, 'refreshToken is invalid')
      .max(512, 'refreshToken is invalid')
      .optional(),
  })
  .strict();

export const meParamsSchema = z.object({}).passthrough();

export default { registerSchema, loginSchema, refreshSchema, logoutSchema, meParamsSchema };
