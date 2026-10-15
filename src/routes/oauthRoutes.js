import { Router } from 'express';
import oauthController from '../controllers/oauthController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import validate from '../middleware/validateMiddleware.js';
import { authLimiter } from '../middleware/rateLimitMiddleware.js';
import {
  startQuerySchema,
  callbackQuerySchema,
  linkStartSchema,
  exchangeSchema,
} from '../validators/oauthValidator.js';

const router = Router();

// GET /api/v1/auth/google — start the browser sign-in flow (302 to Google).
router.get('/', authLimiter(), validate({ query: startQuerySchema }), oauthController.start);

// GET /api/v1/auth/google/callback — Google redirects the user back here.
router.get('/callback', validate({ query: callbackQuerySchema }), oauthController.callback);

// POST /api/v1/auth/google/exchange — one-time handoff code -> token pair.
router.post(
  '/exchange',
  authLimiter(),
  validate({ body: exchangeSchema }),
  oauthController.exchange,
);

// POST /api/v1/auth/google/link — start linking Google to the caller.
router.post(
  '/link',
  authLimiter(),
  authMiddleware,
  validate({ body: linkStartSchema }),
  oauthController.startLink,
);

// GET /api/v1/auth/google/links — list the caller's linked providers.
router.get('/links', authMiddleware, oauthController.links);

// DELETE /api/v1/auth/google/link — unlink Google from the caller.
router.delete('/link', authMiddleware, oauthController.unlink);

export default router;
