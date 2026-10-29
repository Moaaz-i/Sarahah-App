import { z } from 'zod';
import { MESSAGE_CATEGORY_VALUES, IDENTITY_CLUE_VALUES } from '../constants/feedback.js';

const objectId = z
  .string({ required_error: 'id is required' })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'invalid id format');

const booleanFlag = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

/** Optional boolean flag that may be absent entirely. */
const optionalFlag = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

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

    /** Sender's declared intent. Falls back to `general` on the server. */
    category: z
      .enum(MESSAGE_CATEGORY_VALUES, {
        errorMap: () => ({ message: `category must be one of: ${MESSAGE_CATEGORY_VALUES.join(', ')}` }),
      })
      .optional(),

    /** Optional relationship clue from sender (friend, colleague, etc). */
    identityClue: z
      .enum(IDENTITY_CLUE_VALUES, {
        errorMap: () => ({ message: `identityClue must be one of: ${IDENTITY_CLUE_VALUES.join(', ')}` }),
      })
      .optional(),

    /** Which guided prompt the sender answered, if any. */
    promptId: z
      .string()
      .trim()
      .max(64, 'invalid promptId')
      .optional(),

    /** Optional voice audio (base64 data URL or URL string). */
    voiceUrl: z
      .string()
      .trim()
      .max(8_000_000, 'audio payload is too large')
      .optional(),
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
    /** Filter by feedback category (the mirror's drill-down). */
    category: z
      .enum(MESSAGE_CATEGORY_VALUES, {
        errorMap: () => ({ message: `category must be one of: ${MESSAGE_CATEGORY_VALUES.join(', ')}` }),
      })
      .optional(),
    /**
     * Tri-state: true = quarantine only, false = inbox only, absent = both.
     * This is what lets one request power the "held for you" section.
     */
    quarantined: optionalFlag,
  })
  .strict();

/** Path param shared by /messages/:id endpoints. */
export const messageIdParamSchema = z.object({ id: objectId }).strict();

/** Parameter schema for anonymous conversation thread. */
export const conversationKeyParamSchema = z
  .object({
    conversationKey: z
      .string({ required_error: 'conversationKey is required' })
      .trim()
      .min(16, 'invalid conversationKey')
      .max(128, 'invalid conversationKey'),
  })
  .strict();

/** PATCH /messages/:id/archive — body toggles the archived state. */
export const archiveMessageSchema = z
  .object({
    archived: z.boolean().default(true),
  })
  .strict();

/** POST /messages/:id/reply — recipient replies in thread or public. */
export const recipientReplySchema = z
  .object({
    content: z
      .string({ required_error: 'reply content is required' })
      .trim()
      .min(1, 'reply cannot be empty')
      .max(1000, 'reply cannot exceed 1000 characters'),
    isPublic: z.boolean().optional(),
  })
  .strict();

/** POST /messages/thread/:conversationKey/reply — anonymous sender replies back in thread. */
export const senderThreadReplySchema = z
  .object({
    content: z
      .string({ required_error: 'reply content is required' })
      .trim()
      .min(1, 'reply cannot be empty')
      .max(1000, 'reply cannot exceed 1000 characters'),
  })
  .strict();

export default {
  sendMessageParamsSchema,
  sendMessageSchema,
  listMessagesQuerySchema,
  messageIdParamSchema,
  conversationKeyParamSchema,
  archiveMessageSchema,
  recipientReplySchema,
  senderThreadReplySchema,
};