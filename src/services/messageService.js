import Message from '../models/Message.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import { encodeCursor, decodeCursor } from '../utils/pagination.js';
import env from '../config/env.js';
import { analyze } from './harmShieldService.js';
import { MESSAGE_CATEGORIES } from '../constants/feedback.js';

/**
 * Anonymous message service.
 * SECURITY RULES:
 * - The sender is NEVER stored (no field, no ref, no IP, no user agent).
 * - Message content is never logged.
 * - Knowing a message id is useless without being the owner (404, not 403).
 *
 * FEEDBACK LAYER:
 * The category comes from the sender, the harm label comes from a local rule
 * engine over the same text. Neither adds sender signal, so the anonymity
 * guarantee above still holds exactly as before.
 */

/**
 * Normalise a category against the recipient's policy.
 * Returns the category to store, or throws when the recipient does not accept
 * that kind of note. The reply is deliberately generic: it must not reveal
 * whether an account exists or what its settings are beyond what the sender
 * can already see on the public page.
 */
const resolveCategory = (requested, recipient) => {
  const reception = recipient.reception ?? {};
  const wanted = MESSAGE_CATEGORIES[requested?.toUpperCase?.()] ?? requested;

  // A recipient who paused receiving is handled before this point; here we
  // only enforce an explicit allow-list.
  const allowed = Array.isArray(reception.allowedCategories)
    ? reception.allowedCategories
    : [];

  if (allowed.length > 0 && !allowed.includes(wanted)) {
    throw AppError.notFound('Recipient not found or not accepting messages');
  }

  // The owner asked senders to declare what kind of note this is. Honouring
  // that is the whole point of a published policy, so it is enforced here and
  // not only in the UI.
  if (reception.requireCategory && (!requested || !MESSAGE_CATEGORIES[requested?.toUpperCase?.()])) {
    throw AppError.badRequest('This page asks you to choose a note type before sending');
  }

  return MESSAGE_CATEGORIES[wanted] ?? wanted ?? MESSAGE_CATEGORIES.GENERAL;
};

/**
 * Send an anonymous message to a username.
 * Returns a generic response: the caller learns nothing about the recipient
 * beyond what they already knew (their public username).
 */
export const sendMessage = async (
  { username, content, category, promptId },
  { fingerprint, now = new Date() } = {},
) => {
  const recipient = await User.findOne({
    username: String(username).toLowerCase().trim(),
    isActive: true,
    deletedAt: null,
  });

  // Same answer for "no such user" and "user does not accept messages":
  // avoids using this endpoint to enumerate accounts.
  if (!recipient || !recipient.isReceivingMessages) {
    throw AppError.notFound('Recipient not found or not accepting messages');
  }

  const reception = recipient.reception ?? {};

  // A paused inbox answers exactly like a missing one.
  if (reception.isPaused) {
    throw AppError.notFound('Recipient not found or not accepting messages');
  }

  const resolvedCategory = resolveCategory(category, recipient);

  // Per-recipient flood control (in addition to the IP rate limiter).
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentCount = await Message.countDocuments({
    recipient: recipient._id,
    createdAt: { $gte: since },
  });

  if (recentCount >= env.security.maxMessagesPerRecipientPerDay) {
    throw AppError.tooManyRequests('This user is receiving too many messages right now');
  }

  // Local rule-based screen. Never blocks the send — it only decides whether
  // the note lands in the inbox or in the recipient's quarantine section.
  const screening = reception.enableShield === false ? { harmLabel: null, harmConfidence: 0 } : analyze(content);
  const quarantined =
    Boolean(screening.harmLabel) && reception.quarantineFlagged !== false;

  await Message.create({
    recipient: recipient._id,
    content, // already trimmed + length-checked by the validator
    category: resolvedCategory,
    promptId: promptId ? String(promptId).slice(0, 64) : null,
    harmLabel: screening.harmLabel ?? null,
    harmConfidence: screening.confidence ?? 0,
    isQuarantined: quarantined,
  });

  // NOTE: `fingerprint` is only used for rate accounting and is never
  // persisted on the message.
  void fingerprint;

  return { sent: true, message: 'Message delivered anonymously' };
};

/**
 * List the authenticated user's inbox (newest first).
 * Cursor pagination: pass the `nextCursor` of the previous page as `cursor`.
 */
/**
 * Build the inbox filter.
 * `quarantined` is tri-state on purpose:
 * - true  -> ONLY the quarantine section
 * - false -> ONLY normal messages (this is the default inbox)
 * - undef -> the same as false
 * A flagged note never appears in the ordinary list; it has to be released
 * deliberately, so the recipient is never ambushed by it.
 */
export const listMessages = async (
  userId,
  { limit = 20, cursor, isRead, isArchived, category, quarantined } = {},
) => {
  const filter = { recipient: userId, isDeleted: false };
  if (typeof isRead === 'boolean') filter.isRead = isRead;
  if (typeof isArchived === 'boolean') filter.isArchived = isArchived;
  if (category) filter.category = category;
  filter.isQuarantined = quarantined === true;

  const cursorId = decodeCursor(cursor);
  if (cursor) {
    if (!cursorId) throw AppError.badRequest('Invalid cursor');
    filter._id = { $lt: cursorId };
  }

  // Fetch one extra item to know whether another page exists.
  // NOTE: sorted by _id only (ObjectIds are time-ordered) so the cursor
  // pagination is stable and cannot skip/duplicate rows.
  const docs = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1);

  const hasMore = docs.length > limit;
  const items = hasMore ? docs.slice(0, limit) : docs;

  return {
    messages: items,
    pagination: {
      limit,
      hasMore,
      nextCursor: hasMore && items.length ? encodeCursor(items[items.length - 1]._id) : null,
      count: items.length,
    },
  };
};

/** Fetch one message, ensuring ownership. 404 for everything not yours. */
export const getMessage = async (userId, messageId) => {
  const message = await Message.findOne({ _id: messageId, recipient: userId, isDeleted: false });
  if (!message) throw AppError.notFound('Message not found');
  return { message };
};

/** Mark as read (idempotent). Only the owner can do it. */
export const markRead = async (userId, messageId) => {
  const message = await Message.findOneAndUpdate(
    { _id: messageId, recipient: userId, isDeleted: false },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true, runValidators: true },
  );
  if (!message) throw AppError.notFound('Message not found');
  return { message };
};

/** Archive or unarchive. Only the owner can do it. */
export const setArchived = async (userId, messageId, archived) => {
  const message = await Message.findOneAndUpdate(
    { _id: messageId, recipient: userId, isDeleted: false },
    {
      $set: {
        isArchived: Boolean(archived),
        archivedAt: archived ? new Date() : null,
      },
    },
    { new: true, runValidators: true },
  );
  if (!message) throw AppError.notFound('Message not found');
  return { message };
};

/** Logical delete: the row stays, but it disappears from every inbox query. */
export const softDelete = async (userId, messageId) => {
  const message = await Message.findOneAndUpdate(
    { _id: messageId, recipient: userId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  );
  if (!message) throw AppError.notFound('Message not found');
  return { deleted: true, messageId: String(message._id) };
};

/**
 * Recipient override: let a flagged message through.
 * The harm label is deliberately KEPT — the recipient should still see why it
 * was held, but they are the one who decides what reaches their inbox.
 */
export const releaseMessage = async (userId, messageId) => {
  const message = await Message.findOneAndUpdate(
    { _id: messageId, recipient: userId, isDeleted: false },
    { $set: { isQuarantined: false, releasedAt: new Date(), isRead: true } },
    { new: true },
  );
  if (!message) throw AppError.notFound('Message not found');
  return { message };
};

/** Counts used by the inbox header. Cheap aggregation, no message text read. */
export const inboxCounts = async (userId) => {
  const base = { recipient: userId, isDeleted: false };
  const [total, unread, quarantined] = await Promise.all([
    Message.countDocuments({ ...base, isArchived: false }),
    Message.countDocuments({ ...base, isArchived: false, isRead: false }),
    Message.countDocuments({ ...base, isQuarantined: true }),
  ]);
  return { total, unread, quarantined };
};

/**
 * Shape a message for the owner's UI.
 * Harm fields are included so the inbox can explain WHY something was held;
 * nothing here reveals a sender, because the document has none.
 */
export const presentMessage = (message) => {
  const obj = typeof message.toObject === 'function' ? message.toObject() : { ...message };
  return {
    _id: obj._id,
    content: obj.content,
    category: obj.category ?? 'general',
    promptId: obj.promptId ?? null,
    harmLabel: obj.harmLabel ?? null,
    harmConfidence: obj.harmConfidence ?? 0,
    isQuarantined: Boolean(obj.isQuarantined),
    releasedAt: obj.releasedAt ?? null,
    goal: obj.goal ?? null,
    isRead: obj.isRead,
    readAt: obj.readAt ?? null,
    isArchived: obj.isArchived,
    archivedAt: obj.archivedAt ?? null,
    createdAt: obj.createdAt,
  };
};

export default {
  sendMessage,
  listMessages,
  getMessage,
  markRead,
  setArchived,
  softDelete,
  releaseMessage,
  inboxCounts,
  presentMessage,
};
