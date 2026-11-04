import { Router } from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import validate from '../middleware/validateMiddleware.js';
import identityRequestController from '../controllers/identityRequestController.js';
import {
  createIdentityRequestSchema,
  listRequestsQuerySchema,
  requestIdParamSchema,
  messageIdParamSchema,
  respondRequestSchema,
} from '../validators/identityRequestValidator.js';

const router = Router();

// All identity request operations require authentication
router.use(authMiddleware);

// 2) Request sender identity
router.post(
  '/',
  validate({ body: createIdentityRequestSchema }),
  identityRequestController.createRequest,
);

// 3) View all requests received from other users (caller is the sender)
router.get(
  '/received',
  validate({ query: listRequestsQuerySchema }),
  identityRequestController.getReceivedRequests,
);

// View requests sent to others (caller is the receiver)
router.get(
  '/sent',
  validate({ query: listRequestsQuerySchema }),
  identityRequestController.getSentRequests,
);

// Check identity request by message ID
router.get(
  '/message/:messageId',
  validate({ params: messageIdParamSchema }),
  identityRequestController.getRequestByMessage,
);

// 4) Accept or reject request
router.patch(
  '/:id/respond',
  validate({ params: requestIdParamSchema, body: respondRequestSchema }),
  identityRequestController.respondToRequest,
);

export default router;

