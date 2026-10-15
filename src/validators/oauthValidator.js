import { z } from 'zod';

/**
 * OAuth query/body validation.
 *
 * The callback schema intentionally uses a plain z.object (unknown keys are
 * STRIPPED, not rejected): Google appends `scope`, `authuser`, `prompt`,
 * `hd`, `session_state`, ... on top of `code` / `state` / `error`.
 * Everything we do not name explicitly never reaches the service layer.
 */

const loginHint = z
  .string()
  .trim()
  .min(3, 'login_hint is too short')
  .max(254, 'login_hint is too long')
  .optional();

/** GET /api/v1/auth/google */
export const startQuerySchema = z.object({
  login_hint: loginHint,
});

/**
 * GET /api/v1/auth/google/callback
 * `state` is only ever COMPARED against the signed cookie, never trusted alone.
 */
export const callbackQuerySchema = z.object({
  code: z.string().trim().min(1).max(4096).optional(),
  state: z.string().trim().min(1).max(512).optional(),
  error: z.string().trim().min(1).max(120).optional(),
  error_description: z.string().trim().max(1000).optional(),
  // Google's issuer hint (CSRF hardening); validated when present.
  iss: z.string().trim().max(300).optional(),
});

/** POST /api/v1/auth/google/link  (start the link flow) */
export const linkStartSchema = z
  .object({
    login_hint: loginHint,
  })
  .strict();

/** POST /api/v1/auth/google/exchange */
export const exchangeSchema = z
  .object({
    handoff: z
      .string({ required_error: 'handoff is required' })
      .trim()
      .min(20, 'handoff code is invalid')
      .max(128, 'handoff code is invalid'),
  })
  .strict();

export default {
  startQuerySchema,
  callbackQuerySchema,
  linkStartSchema,
  exchangeSchema,
};
