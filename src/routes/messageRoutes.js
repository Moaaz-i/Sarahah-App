import { Router } from 'express';
import messageController from '../controllers/messageController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import validate from '../middleware/validateMiddleware.js';
import { messageLimiter } from '../middleware/rateLimitMiddleware.js';
import {
  sendMessageParamsSchema,
  sendMessageSchema,
  listMessagesQuerySchema,
  messageIdParamSchema,
  conversationKeyParamSchema,
  archiveMessageSchema,
  recipientReplySchema,
  senderThreadReplySchema,
} from '../validators/messageValidator.js';

const router = Router();

// Anonymous conversation thread endpoints (Sender side, accessed via secret conversationKey)
router.get(
  '/thread/:conversationKey',
  validate({ params: conversationKeyParamSchema }),
  messageController.getThread,
);

router.post(
  '/thread/:conversationKey/reply',
  messageLimiter(),
  validate({ params: conversationKeyParamSchema, body: senderThreadReplySchema }),
  messageController.replyThread,
);

// POST /api/v1/messages/:username — public, anonymous (rate limited).
router.post(
  '/:username',
  messageLimiter(),
  validate({ params: sendMessageParamsSchema, body: sendMessageSchema }),
  messageController.sendMessage,
);

// Everything below requires authentication and only ever touches
// the caller's own messages.
router.get('/', authMiddleware, validate({ query: listMessagesQuerySchema }), messageController.listMessages);

// Declared BEFORE /:id — otherwise "counts" would be read as a message id.
router.get('/counts', authMiddleware, messageController.counts);

router.get('/:id', authMiddleware, validate({ params: messageIdParamSchema }), messageController.getMessage);

router.patch(
  '/:id/read',
  authMiddleware,
  validate({ params: messageIdParamSchema }),
  messageController.markRead,
);

router.patch(
  '/:id/archive',
  authMiddleware,
  validate({ params: messageIdParamSchema, body: archiveMessageSchema }),
  messageController.archiveMessage,
);

// Recipient override: let a shield-flagged message through.
router.patch(
  '/:id/release',
  authMiddleware,
  validate({ params: messageIdParamSchema }),
  messageController.releaseMessage,
);

// Recipient reply to message (private thread or public story card)
router.post(
  '/:id/reply',
  authMiddleware,
  validate({ params: messageIdParamSchema, body: recipientReplySchema }),
  messageController.replyMessage,
);

router.delete(
  '/:id',
  authMiddleware,
  validate({ params: messageIdParamSchema }),
  messageController.deleteMessage,
);

export default router;
