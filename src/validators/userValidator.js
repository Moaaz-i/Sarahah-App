import { z } from 'zod';
import { validateAvatarRef } from '../utils/imageRef.js';

const usernameParam = z
  .string({ required_error: 'username is required' })
  .trim()
  .min(3, 'username must be at least 3 characters')
  .max(30, 'username cannot exceed 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'invalid username format')
  .transform((v) => v.toLowerCase());

/** PATCH /users/me — only these fields; role/isActive/isVerified are rejected. */
export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'name must be at least 2 characters')
      .max(100, 'name cannot exceed 100 characters')
      .optional(),
    bio: z
      .string()
      .trim()
      .max(300, 'bio cannot exceed 300 characters')
      .optional(),
    avatar: z
      .string()
      .trim()
      // The cap lives in imageRef.js; the check here is a cheap early reject
      // so an absurd body fails validation instead of reaching the parser.
      .max(65536, 'avatar reference is too long')
      // Delegated to the canonical allow-list validator, which accepts exactly
      // four shapes (empty, embedded data URI, our own upload path, or an
      // http(s) URL) and parses each strictly. The previous rule allowed any
      // `https?://` string up to 500 chars, which is the classic link-input
      // surface; this closes it and simultaneously makes the built-in embedded
      // presets storable, which the old regex silently rejected.
      .refine(
        (v) => {
          try {
            validateAvatarRef(v);
            return true;
          } catch {
            return false;
          }
        },
        {
          message:
            'avatar must be an http(s) URL, an uploaded image, or a supported embedded image',
        },
      )
      .optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'at least one field is required',
  });

export const changePasswordSchema = z
  .object({
    // Optional in the schema because Google-only accounts have no password to
    // present. The SERVICE decides whether it is required: it is enforced
    // there for any account that actually has one, so a password account can
    // never skip it.
    currentPassword: z
      .string()
      .min(1, 'currentPassword cannot be empty when provided')
      .max(72, 'currentPassword is too long')
      .optional(),
    newPassword: z
      .string({ required_error: 'newPassword is required' })
      .min(8, 'newPassword must be at least 8 characters')
      .max(72, 'newPassword cannot exceed 72 characters')
      .regex(/[A-Za-z]/, 'newPassword must contain at least one letter')
      .regex(/[0-9]/, 'newPassword must contain at least one number'),
  })
  .strict();

export const deleteAccountSchema = z
  .object({
    // Optional for the same reason as changePasswordSchema: Google-only
    // accounts have nothing to confirm with. Verified in the service when the
    // account has a password.
    password: z
      .string()
      .min(1, 'password cannot be empty when provided')
      .max(72, 'password is too long')
      .optional(),
  })
  .strict();

export const usernameParamSchema = z.object({ username: usernameParam }).strict();

export default {
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
  usernameParamSchema,
};
