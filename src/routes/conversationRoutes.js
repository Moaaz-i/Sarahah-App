import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import validate from '../middleware/validateMiddleware.js';
import conversationController from '../controllers/conversationController.js';
import {
  conversationIdParamSchema,
  sendConversationMessageSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
} from '../validators/conversationValidator.js';

const router = Router();

// All conversation operations require authentication
router.use(authMiddleware);

// List user's conversations
router.get(
  '/',
  validate({ query: listConversationsQuerySchema }),
  conversationController.listConversations,
);

// Get single conversation
router.get(
  '/:id',
  validate({ params: conversationIdParamSchema }),
  conversationController.getConversation,
);

// 5) Get conversation messages (only the two users involved)
router.get(
  '/:id/messages',
  validate({ params: conversationIdParamSchema, query: listMessagesQuerySchema }),
  conversationController.getMessages,
);

// 4) Send messages inside conversation (only the two users involved)
router.post(
  '/:id/messages',
  validate({ params: conversationIdParamSchema, body: sendConversationMessageSchema }),
  conversationController.sendMessage,
);

export default router;

