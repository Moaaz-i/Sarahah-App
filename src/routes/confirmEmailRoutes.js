import { z } from 'zod';
import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import authMiddleware from '../middleware/authMiddleware.js';
import validate from '../middleware/validateMiddleware.js';
import { createLimiter } from '../middleware/rateLimitMiddleware.js';
import * as emailConfirmService from '../services/emailConfirmService.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';

const router = Router();

const otpLimiter = createLimiter({
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: 'Too many OTP requests, please try again later.',
});

const otpBodySchema = z
  .object({
    code: z
      .string({ required_error: 'code is required' })
      .trim()
      .regex(/^\d{6}$/, 'code must be a 6-digit code'),
  })
  .strict();

// POST /api/v1/confirm-email/send — authenticated; sends a code to the caller's email.
router.post('/send', authMiddleware, otpLimiter, asyncHandler(async (req, res) => {
  const result = await emailConfirmService.sendConfirmationOtp(req.user, {
    requestId: req.requestId,
  });

  res.status(202).json({
    success: true,
    message: 'أُرسل رمز التحقق إلى بريدك الإلكتروني',
    data: result,
  });
}));

// POST /api/v1/confirm-email/verify — authenticated; verifies the code.
router.post(
  '/verify',
  authMiddleware,
  otpLimiter,
  validate({ body: otpBodySchema }),
  asyncHandler(async (req, res) => {
    const result = await emailConfirmService.confirmEmailWithOtp(
      req.user._id,
      req.body.code,
      { requestId: req.requestId },
    );

    res.status(200).json({
      success: true,
      message: result.alreadyVerified
        ? 'بريدك الإلكتروني مُؤكَّد بالفعل'
        : 'تم تأكيد بريدك الإلكتروني',
      data: result,
    });
  }),
);

export default router;
