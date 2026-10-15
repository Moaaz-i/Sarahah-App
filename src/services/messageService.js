import Message from '../models/Message.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import { encodeCursor, decodeCursor } from '../utils/pagination.js';
import env from '../config/env.js';

/**
 * Anonymous message service.
 * SECURITY RULES:
 * - The sender is NEVER stored (no field, no ref, no IP, no user agent).
 * - Message content is never logged.
 * - Knowing a message id is useless without being the owner (404, not 403).
 */

/**
 * Send an anonymous message to a username.
 * Returns a generic response: the caller learns nothing about the recipient
 * beyond what they already knew (their public username).
 */
export const sendMessage = async ({ username, content }, { fingerprint, now = new Date() } = {}) => {
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

  // Per-recipient flood control (in addition to the IP rate limiter).
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentCount = await Message.countDocuments({
    recipient: recipient._id,
    createdAt: { $gte: since },
  });

  if (recentCount >= env.security.maxMessagesPerRecipientPerDay) {
    throw AppError.tooManyRequests('This user is receiving too many messages right now');
  }

  await Message.create({
    recipient: recipient._id,
    content, // already trimmed + length-checked by the validator
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
export const listMessages = async (userId, { limit = 20, cursor, isRead, isArchived } = {}) => {
  const filter = { recipient: userId, isDeleted: false };
  if (typeof isRead === 'boolean') filter.isRead = isRead;
  if (typeof isArchived === 'boolean') filter.isArchived = isArchived;

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

export default { sendMessage, listMessages, getMessage, markRead, setArchived, softDelete };
