import asyncHandler from '../utils/asyncHandler.js';
import * as messageService from '../services/messageService.js';
import { fingerprintFromRequest } from '../utils/hashToken.js';

/** POST /api/v1/messages/:username — anonymous, no auth required. */
export const sendMessage = asyncHandler(async (req, res) => {
  const result = await messageService.sendMessage(
    { username: req.params.username, content: req.body.content },
    { fingerprint: fingerprintFromRequest(req) },
  );

  res.status(201).json({
    success: true,
    message: result.message,
    data: { sent: true },
  });
});

/** GET /api/v1/messages — own inbox, cursor pagination + filters. */
export const listMessages = asyncHandler(async (req, res) => {
  const { limit, cursor, isRead, isArchived } = req.query;

  const result = await messageService.listMessages(req.user._id, {
    limit,
    cursor,
    isRead,
    isArchived,
  });

  res.status(200).json({
    success: true,
    message: 'Messages fetched successfully',
    data: result,
  });
});

/** GET /api/v1/messages/:id — owner only (404 otherwise). */
export const getMessage = asyncHandler(async (req, res) => {
  const result = await messageService.getMessage(req.user._id, req.params.id);

  res.status(200).json({
    success: true,
    message: 'Message fetched successfully',
    data: result,
  });
});

/** PATCH /api/v1/messages/:id/read */
export const markRead = asyncHandler(async (req, res) => {
  const result = await messageService.markRead(req.user._id, req.params.id);

  res.status(200).json({
    success: true,
    message: 'Message marked as read',
    data: result,
  });
});

/** PATCH /api/v1/messages/:id/archive — body: { archived: true|false } */
export const archiveMessage = asyncHandler(async (req, res) => {
  const result = await messageService.setArchived(req.user._id, req.params.id, req.body.archived);

  res.status(200).json({
    success: true,
    message: req.body.archived ? 'Message archived' : 'Message unarchived',
    data: result,
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

export default { sendMessage, listMessages, getMessage, markRead, archiveMessage, deleteMessage };
