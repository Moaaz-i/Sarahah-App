import asyncHandler from '../utils/asyncHandler.js';
import * as messageService from '../services/messageService.js';
import { fingerprintFromRequest } from '../utils/hashToken.js';

/** POST /api/v1/messages/:username — anonymous, no auth required. */
export const sendMessage = asyncHandler(async (req, res) => {
  const result = await messageService.sendMessage(
    {
      username: req.params.username,
      content: req.body.content,
      category: req.body.category,
      promptId: req.body.promptId,
      identityClue: req.body.identityClue,
      voiceUrl: req.body.voiceUrl,
    },
    { fingerprint: fingerprintFromRequest(req) },
  );

  res.status(201).json({
    success: true,
    message: result.message,
    data: {
      sent: true,
      conversationKey: result.conversationKey,
    },
  });
});

/** GET /api/v1/messages — own inbox, cursor pagination + filters. */
export const listMessages = asyncHandler(async (req, res) => {
  const { limit, cursor, isRead, isArchived, category, quarantined } = req.query;

  const result = await messageService.listMessages(req.user._id, {
    limit,
    cursor,
    isRead,
    isArchived,
    category,
    quarantined,
  });

  res.status(200).json({
    success: true,
    message: 'Messages fetched successfully',
    data: {
      ...result,
      messages: result.messages.map(messageService.presentMessage),
    },
  });
});

/** GET /api/v1/messages/counts — unread / total / quarantined, for the header. */
export const counts = asyncHandler(async (req, res) => {
  const data = await messageService.inboxCounts(req.user._id);

  res.status(200).json({
    success: true,
    message: 'Inbox counts fetched',
    data,
  });
});

/** GET /api/v1/messages/:id — owner only (404 otherwise). */
export const getMessage = asyncHandler(async (req, res) => {
  const result = await messageService.getMessage(req.user._id, req.params.id);

  res.status(200).json({
    success: true,
    message: 'Message fetched successfully',
    data: { message: messageService.presentMessage(result.message) },
  });
});

/** PATCH /api/v1/messages/:id/read */
export const markRead = asyncHandler(async (req, res) => {
  const result = await messageService.markRead(req.user._id, req.params.id);

  res.status(200).json({
    success: true,
    message: 'Message marked as read',
    data: { message: messageService.presentMessage(result.message) },
  });
});

/** PATCH /api/v1/messages/:id/archive — body: { archived: true|false } */
export const archiveMessage = asyncHandler(async (req, res) => {
  const result = await messageService.setArchived(req.user._id, req.params.id, req.body.archived);

  res.status(200).json({
    success: true,
    message: req.body.archived ? 'Message archived' : 'Message unarchived',
    data: { message: messageService.presentMessage(result.message) },
  });
});

/** PATCH /api/v1/messages/:id/release — recipient overrides the shield. */
export const releaseMessage = asyncHandler(async (req, res) => {
  const result = await messageService.releaseMessage(req.user._id, req.params.id);

  res.status(200).json({
    success: true,
    message: 'Message released into your inbox',
    data: { message: messageService.presentMessage(result.message) },
  });
});

/** POST /api/v1/messages/:id/reply — recipient writes a private/public reply */
export const replyMessage = asyncHandler(async (req, res) => {
  const result = await messageService.addRecipientReply(req.user._id, req.params.id, {
    content: req.body.content,
    isPublic: req.body.isPublic,
  });

  res.status(200).json({
    success: true,
    message: 'Reply saved successfully',
    data: result,
  });
});

/** GET /api/v1/messages/thread/:conversationKey — anonymous sender checks thread */
export const getThread = asyncHandler(async (req, res) => {
  const thread = await messageService.getThreadByConversationKey(req.params.conversationKey);

  res.status(200).json({
    success: true,
    message: 'Thread fetched successfully',
    data: { thread },
  });
});

/** POST /api/v1/messages/thread/:conversationKey/reply — anonymous sender replies */
export const replyThread = asyncHandler(async (req, res) => {
  const thread = await messageService.addSenderThreadReply(req.params.conversationKey, {
    content: req.body.content,
  });

  res.status(200).json({
    success: true,
    message: 'Reply sent successfully',
    data: { thread },
  });
});

/** DELETE /api/v1/messages/:id — logical delete. */
export const deleteMessage = asyncHandler(async (req, res) => {
  const result = await messageService.softDelete(req.user._id, req.params.id);

  res.status(200).json({
    success: true,
    message: 'Message deleted',
    data: result,
  });
});

export default {
  sendMessage,
  listMessages,
  counts,
  getMessage,
  markRead,
  archiveMessage,
  releaseMessage,
  replyMessage,
  getThread,
  replyThread,
  deleteMessage,
};
