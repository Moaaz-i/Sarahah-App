import asyncHandler from '../utils/asyncHandler.js';
import * as passwordService from '../services/passwordService.js';

/**
 * POST /api/v1/password/forgot
 * Sends a 6-digit OTP to the account email.
 * Always answers 202 Accepted regardless of whether the email exists.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await passwordService.requestPasswordReset(req.body.email, {
    requestId: req.requestId,
  });

  res.status(202).json({
    success: true,
    message: 'إذا كان البريد مسجّلًا، فقد أُرسل رمز تحقق إليه',
    data: result,
  });
});

/** POST /api/v1/password/reset */
export const resetPassword = asyncHandler(async (req, res) => {
  const result = await passwordService.resetPasswordWithOtp(req.body, {
    requestId: req.requestId,
  });

  res.status(200).json({
    success: true,
    message: 'تمت إعادة تعيين كلمة المرور وإلغاء جميع الجلسات السابقة',
    data: result,
  });
});

export default { forgotPassword, resetPassword };
