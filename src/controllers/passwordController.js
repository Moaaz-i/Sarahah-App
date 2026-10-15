import asyncHandler from '../utils/asyncHandler.js';
import * as passwordService from '../services/passwordService.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';

/**
 * POST /api/v1/password/forgot
 *
 * Temporarily unavailable. The only channel we had for handing a reset link
 * to the user was email, and email sending has been removed from the project
 * — minting a token now would create a record nobody could ever read.
 *
 * Answered with an explicit 503 rather than a 404 so a client can tell
 * "this feature is off" apart from "this endpoint moved", and so it can be
 * switched back on the moment a delivery channel (SMS, WhatsApp, email) is
 * reintroduced. Every caller gets the same answer, so account enumeration
 * stays impossible either way.
 */
export const forgotPassword = asyncHandler(async () => {
  throw new AppError(503, ERROR_CODES.PASSWORD_RESET_DISABLED);
});

/** POST /api/v1/password/reset */
export const resetPassword = asyncHandler(async (req, res) => {
  const result = await passwordService.resetPassword(req.body, { requestId: req.requestId });

  res.status(200).json({
    success: true,
    message: 'Password has been reset, all previous sessions were revoked',
    data: result,
  });
});

export default { forgotPassword, resetPassword };
