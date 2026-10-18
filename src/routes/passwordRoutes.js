import { Router } from 'express';
import passwordController from '../controllers/passwordController.js';
import validate from '../middleware/validateMiddleware.js';
import { passwordLimiter } from '../middleware/rateLimitMiddleware.js';
import { forgotPasswordSchema, resetPasswordSchema } from '../validators/passwordValidator.js';

const router = Router();

// POST /api/v1/password/forgot — send a 6-digit OTP to the account email.
router.post(
  '/forgot',
  passwordLimiter(),
  validate({ body: forgotPasswordSchema }),
  passwordController.forgotPassword,
);

// POST /api/v1/password/reset — verify the OTP and set the new password.
router.post(
  '/reset',
  passwordLimiter(),
  validate({ body: resetPasswordSchema }),
  passwordController.resetPassword,
);

export default router;
