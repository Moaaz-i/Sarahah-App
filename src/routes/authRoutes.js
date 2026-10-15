import { Router } from 'express';
import authController from '../controllers/authController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import validate from '../middleware/validateMiddleware.js';
import { authLimiter } from '../middleware/rateLimitMiddleware.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} from '../validators/authValidator.js';

const router = Router();

// POST /api/v1/auth/register
router.post(
  '/register',
  authLimiter(),
  validate({ body: registerSchema }),
  authController.register,
);

// POST /api/v1/auth/login
router.post('/login', authLimiter(), validate({ body: loginSchema }), authController.login);

// POST /api/v1/auth/refresh
router.post('/refresh', authLimiter(), validate({ body: refreshSchema }), authController.refresh);

// POST /api/v1/auth/logout
router.post('/logout', authMiddleware, validate({ body: logoutSchema }), authController.logout);

// GET /api/v1/auth/me
router.get('/me', authMiddleware, authController.me);

export default router;
