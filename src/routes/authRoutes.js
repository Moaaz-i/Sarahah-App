import { Router } from 'express';
import authController from '../controllers/authController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import validate from '../middleware/validateMiddleware.js';
import { authLimiter } from '../middleware/rateLimitMiddleware.js';
import {
  registerSchema,
  loginSchema,
  loginConfirmSchema,
  twoFactorVerifySchema,
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

// POST /api/v1/auth/login-confirm & /login/confirm — completes 2FA login
router.post(
  '/login-confirm',
  authLimiter(),
  validate({ body: loginConfirmSchema }),
  authController.loginConfirm,
);
router.post(
  '/login/confirm',
  authLimiter(),
  validate({ body: loginConfirmSchema }),
  authController.loginConfirm,
);

// 2-Step Verification: send OTP to enable
router.post('/2fa/send-otp', authMiddleware, authLimiter(), authController.sendTwoFactorOtp);

// 2-Step Verification: verify OTP and enable
router.post(
  '/2fa/verify-enable',
  authMiddleware,
  authLimiter(),
  validate({ body: twoFactorVerifySchema }),
  authController.verifyAndEnableTwoFactor,
);

// 2-Step Verification: disable
router.post('/2fa/disable', authMiddleware, authController.disableTwoFactor);

// POST /api/v1/auth/refresh
router.post('/refresh', authLimiter(), validate({ body: refreshSchema }), authController.refresh);

// POST /api/v1/auth/logout — logout from current device
router.post('/logout', authMiddleware, validate({ body: logoutSchema }), authController.logout);

// POST /api/v1/auth/logout-all — logout from all devices
router.post('/logout-all', authMiddleware, authController.logoutAll);

// GET /api/v1/auth/me
router.get('/me', authMiddleware, authController.me);

export default router;
