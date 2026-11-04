import asyncHandler from '../utils/asyncHandler.js';
import * as conversationService from '../services/conversationService.js';

/** GET /api/v1/conversations — list user's conversations */
export const listConversations = asyncHandler(async (req, res) => {
  const { limit, page } = req.query;
  const result = await conversationService.listConversations(req.user._id, {
    limit,
    page,
  });

  res.status(200).json({
    success: true,
    message: 'Conversations fetched successfully',
    data: result,
  });
});

/** GET /api/v1/conversations/:id — get single conversation */
export const getConversation = asyncHandler(async (req, res) => {
  const result = await conversationService.getConversationById(
    req.user._id,
    req.params.id,
  );

  res.status(200).json({
    success: true,
    message: 'Conversation fetched successfully',
    data: result,
  });
});

/** GET /api/v1/conversations/:id/messages — get messages in conversation */
export const getMessages = asyncHandler(async (req, res) => {
  const { limit, page } = req.query;
  const result = await conversationService.getConversationMessages(
    req.user._id,
    req.params.id,
    { limit, page },
  );

  res.status(200).json({
    success: true,
    message: 'Conversation messages fetched successfully',
    data: result,
  });
});

/** POST /api/v1/conversations/:id/messages — send a message inside conversation */
export const sendMessage = asyncHandler(async (req, res) => {
  const result = await conversationService.sendMessageInConversation(
    req.user._id,
    req.params.id,
    req.body.content,
  );

  res.status(201).json({
    success: true,
    message: 'Message sent successfully',
    data: result,
  });
});

export default {
  listConversations,
  getConversation,
  getMessages,
  sendMessage,
};

