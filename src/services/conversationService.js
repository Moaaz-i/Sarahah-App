import Conversation from '../models/Conversation.js';
import ConversationMessage from '../models/ConversationMessage.js';
import AppError from '../utils/AppError.js';
import {
  notifyConversationMessage,
  notifyUserNewMessage,
} from '../sockets/socketService.js';

/**
 * Check if a user is an authorized participant in a conversation.
 * Strictly enforces that only the two involved users can access or send messages.
 */
export const assertConversationParticipant = (conversation, userId) => {
  if (!conversation) {
    throw AppError.notFound('Conversation not found');
  }

  const isParticipant = conversation.participants.some(
    (p) => String(p._id || p) === String(userId),
  );

  if (!isParticipant) {
    throw AppError.forbidden('You are not authorized to access this conversation');
  }
};

/**
 * List all conversations for the authenticated user.
 */
export const listConversations = async (userId, { limit = 20, page = 1 } = {}) => {
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (parsedPage - 1) * parsedLimit;

  const query = { participants: userId };

  const [conversations, total] = await Promise.all([
    Conversation.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('participants', 'name username avatar bio')
      .populate('message', 'content category createdAt')
      .populate('identityRequest', 'status respondedAt'),
    Conversation.countDocuments(query),
  ]);

  return {
    conversations,
    total,
    page: parsedPage,
    totalPages: Math.ceil(total / parsedLimit),
  };
};

/**
 * Get a single conversation by ID.
 * Strictly authorized: only participants can view.
 */
export const getConversationById = async (userId, conversationId) => {
  const conversation = await Conversation.findById(conversationId)
    .populate('participants', 'name username avatar bio')
    .populate('message', 'content category createdAt')
    .populate('identityRequest', 'status respondedAt');

  assertConversationParticipant(conversation, userId);

  return conversation;
};

/**
 * 5) Get Conversation Messages
 * Allow both users to retrieve the conversation messages.
 * Only the two users involved can access.
 */
export const getConversationMessages = async (
  userId,
  conversationId,
  { limit = 100, page = 1 } = {},
) => {
  const conversation = await Conversation.findById(conversationId);
  assertConversationParticipant(conversation, userId);

  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (parsedPage - 1) * parsedLimit;

  const [messages, total] = await Promise.all([
    ConversationMessage.find({ conversation: conversationId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('sender', 'name username avatar'),
    ConversationMessage.countDocuments({ conversation: conversationId }),
  ]);

  // Mark unread messages from the other participant as read by current user
  await ConversationMessage.updateMany(
    {
      conversation: conversationId,
      sender: { $ne: userId },
      readBy: { $ne: userId },
    },
    {
      $addToSet: { readBy: userId },
    },
  );

  return {
    messages,
    total,
    page: parsedPage,
    totalPages: Math.ceil(total / parsedLimit),
  };
};

/**
 * 4) Send Messages (inside conversation)
 * Allow both users to send messages inside the conversation.
 * Only the two users involved can send messages.
 */
export const sendMessageInConversation = async (userId, conversationId, content) => {
  const conversation = await Conversation.findById(conversationId);
  assertConversationParticipant(conversation, userId);

  const trimmedContent = String(content || '').trim();
  if (!trimmedContent) {
    throw AppError.badRequest('Message content cannot be empty');
  }

  if (trimmedContent.length > 2000) {
    throw AppError.badRequest('Message content cannot exceed 2000 characters');
  }

  const messageDoc = await ConversationMessage.create({
    conversation: conversationId,
    sender: userId,
    content: trimmedContent,
    readBy: [userId],
  });

  // Update conversation's lastMessage and timestamp
  conversation.lastMessage = {
    content: trimmedContent,
    sender: userId,
    createdAt: messageDoc.createdAt,
  };
  await conversation.save();

  const populated = await ConversationMessage.findById(messageDoc._id).populate(
    'sender',
    'name username avatar',
  );

  // Real-time broadcast to the conversation room
  notifyConversationMessage(conversationId, populated);

  // Notify the other participant
  const otherParticipantId = conversation.participants.find(
    (p) => String(p._id || p) !== String(userId),
  );

  if (otherParticipantId) {
    notifyUserNewMessage(otherParticipantId, {
      type: 'conversation_message',
      conversationId,
      message: populated,
    });
  }

  return populated;
};

export default {
  assertConversationParticipant,
  listConversations,
  getConversationById,
  getConversationMessages,
  sendMessageInConversation,
};

