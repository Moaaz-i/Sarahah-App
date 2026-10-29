import crypto from 'crypto';
import Message from '../models/Message.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import { encodeCursor, decodeCursor } from '../utils/pagination.js';
import env from '../config/env.js';
import { analyze } from './harmShieldService.js';
import { MESSAGE_CATEGORIES } from '../constants/feedback.js';
import { notifyUserNewMessage, notifyThreadNewReply } from '../sockets/socketService.js';

/**
 * Anonymous message service.
 * SECURITY RULES:
 * - The sender is NEVER stored (no field, no ref, no IP, no user agent).
 * - Message content is never logged.
 * - Knowing a message id is useless without being the owner (404, not 403).
 */

const resolveCategory = (requested, recipient) => {
  const reception = recipient.reception ?? {};
  const wanted = MESSAGE_CATEGORIES[requested?.toUpperCase?.()] ?? requested;

  const allowed = Array.isArray(reception.allowedCategories)
    ? reception.allowedCategories
    : [];

  if (allowed.length > 0 && !allowed.includes(wanted)) {
    throw AppError.notFound('Recipient not found or not accepting messages');
  }

  if (reception.requireCategory && (!requested || !MESSAGE_CATEGORIES[requested?.toUpperCase?.()])) {
    throw AppError.badRequest('This page asks you to choose a note type before sending');
  }

  return MESSAGE_CATEGORIES[wanted] ?? wanted ?? MESSAGE_CATEGORIES.GENERAL;
};

/**
 * Send an anonymous message to a username.
 */
export const sendMessage = async (
  { username, content, category, promptId, identityClue = 'none', voiceUrl = null },
  { fingerprint, now = new Date() } = {},
) => {
  const recipient = await User.findOne({
    username: String(username).toLowerCase().trim(),
    isActive: true,
    deletedAt: null,
  });

  if (!recipient || !recipient.isReceivingMessages) {
    throw AppError.notFound('Recipient not found or not accepting messages');
  }

  const reception = recipient.reception ?? {};

  if (reception.isPaused) {
    throw AppError.notFound('Recipient not found or not accepting messages');
  }

  const resolvedCategory = resolveCategory(category, recipient);

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentCount = await Message.countDocuments({
    recipient: recipient._id,
    createdAt: { $gte: since },
  });

  if (recentCount >= env.security.maxMessagesPerRecipientPerDay) {
    throw AppError.tooManyRequests('This user is receiving too many messages right now');
  }

  const screening = reception.enableShield === false ? { harmLabel: null, harmConfidence: 0, sentiment: 'neutral' } : analyze(content);
  const quarantined =
    Boolean(screening.harmLabel) && reception.quarantineFlagged !== false;

  const conversationKey = crypto.randomBytes(24).toString('hex');

  const createdMessage = await Message.create({
    recipient: recipient._id,
    content,
    category: resolvedCategory,
    identityClue: identityClue || 'none',
    promptId: promptId ? String(promptId).slice(0, 64) : null,
    harmLabel: screening.harmLabel ?? null,
    harmConfidence: screening.confidence ?? 0,
    sentiment: screening.sentiment ?? 'neutral',
    isQuarantined: quarantined,
    conversationKey,
    voiceUrl: voiceUrl || null,
  });

  // Real-time notification to the recipient if online
  notifyUserNewMessage(String(recipient._id), {
    _id: String(createdMessage._id),
    content: createdMessage.content,
    category: createdMessage.category,
    identityClue: createdMessage.identityClue,
    sentiment: createdMessage.sentiment,
    isQuarantined: createdMessage.isQuarantined,
    voiceUrl: createdMessage.voiceUrl,
    createdAt: createdMessage.createdAt,
  });

  void fingerprint;

  return {
    sent: true,
    message: 'Message delivered anonymously',
    conversationKey,
  };
};

/**
 * List the authenticated user's inbox (newest first).
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

/**
 * Add a reply to a message from the recipient.
 */
export const addRecipientReply = async (userId, messageId, { content, isPublic = false }) => {
  const message = await Message.findOne({ _id: messageId, recipient: userId, isDeleted: false });
  if (!message) throw AppError.notFound('Message not found');

  if (isPublic) {
    message.publicReply = content;
    message.publicReplyAt = new Date();
  }

  message.replies.push({
    authorType: 'recipient',
    content,
    createdAt: new Date(),
  });

  await message.save();

  // Real-time notification to the anonymous thread room
  notifyThreadNewReply(message.conversationKey, {
    authorType: 'recipient',
    content,
    createdAt: new Date(),
  });

  return { message: presentMessage(message) };
};

/**
 * Fetch thread by anonymous conversation key for the sender.
 */
export const getThreadByConversationKey = async (conversationKey) => {
  const message = await Message.findOne({ conversationKey, isDeleted: false })
    .populate('recipient', 'name username avatar');
  if (!message) throw AppError.notFound('Conversation not found');

  return {
    recipient: {
      name: message.recipient?.name,
      username: message.recipient?.username,
      avatar: message.recipient?.avatar,
    },
    content: message.content,
    category: message.category,
    identityClue: message.identityClue,
    createdAt: message.createdAt,
    publicReply: message.publicReply,
    publicReplyAt: message.publicReplyAt,
    replies: message.replies,
    voiceUrl: message.voiceUrl,
  };
};

/**
 * Add an anonymous reply from the sender to the thread.
 */
export const addSenderThreadReply = async (conversationKey, { content }) => {
  const message = await Message.findOne({ conversationKey, isDeleted: false });
  if (!message) throw AppError.notFound('Conversation not found');

  const screen = analyze(content);
  if (screen.harmLabel === 'threat') {
    throw AppError.badRequest('Cannot send harmful reply');
  }

  message.replies.push({
    authorType: 'sender',
    content,
    createdAt: new Date(),
  });

  // Re-flag as unread so the recipient is prompted in inbox
  message.isRead = false;
  await message.save();

  // Real-time broadcast to thread participants
  notifyThreadNewReply(conversationKey, {
    authorType: 'sender',
    content,
    createdAt: new Date(),
  });

  // Real-time alert to recipient about thread activity
  notifyUserNewMessage(String(message.recipient), {
    type: 'thread_reply',
    messageId: String(message._id),
    content: `رد جديد في محادثة: ${content.slice(0, 50)}`,
    createdAt: new Date(),
  });

  return getThreadByConversationKey(conversationKey);
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
 */
export const presentMessage = (message) => {
  const obj = typeof message.toObject === 'function' ? message.toObject() : { ...message };
  return {
    _id: obj._id,
    content: obj.content,
    category: obj.category ?? 'general',
    identityClue: obj.identityClue ?? 'none',
    promptId: obj.promptId ?? null,
    sentiment: obj.sentiment ?? 'neutral',
    harmLabel: obj.harmLabel ?? null,
    harmConfidence: obj.harmConfidence ?? 0,
    isQuarantined: Boolean(obj.isQuarantined),
    releasedAt: obj.releasedAt ?? null,
    goal: obj.goal ?? null,
    isRead: obj.isRead,
    readAt: obj.readAt ?? null,
    isArchived: obj.isArchived,
    archivedAt: obj.archivedAt ?? null,
    publicReply: obj.publicReply ?? null,
    publicReplyAt: obj.publicReplyAt ?? null,
    replies: obj.replies ?? [],
    voiceUrl: obj.voiceUrl ?? null,
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
  addRecipientReply,
  getThreadByConversationKey,
  addSenderThreadReply,
  inboxCounts,
  presentMessage,
};
