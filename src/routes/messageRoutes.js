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
  archiveMessageSchema,
} from '../validators/messageValidator.js';

const router = Router();

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

router.delete(
  '/:id',
  authMiddleware,
  validate({ params: messageIdParamSchema }),
  messageController.deleteMessage,
);

export default router;
