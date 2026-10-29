import asyncHandler from '../utils/asyncHandler.js';
import * as authService from '../services/authService.js';

/** POST /api/v1/auth/register */
export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, {
    userAgent: req.headers['user-agent'],
    requestId: req.requestId,
  });

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    data: result,
  });
});

/** POST /api/v1/auth/login */
export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, {
    userAgent: req.headers['user-agent'],
    requestId: req.requestId,
  });

  res.status(200).json({
    success: true,
    message: result.requiresTwoFactor
      ? '2-step verification code sent to your email'
      : 'Logged in successfully',
    data: result,
  });
});

/** POST /api/v1/auth/login-confirm — verifies OTP and issues tokens */
export const loginConfirm = asyncHandler(async (req, res) => {
  const result = await authService.loginConfirm(req.body, {
    userAgent: req.headers['user-agent'],
    requestId: req.requestId,
  });

  res.status(200).json({
    success: true,
    message: '2-step verification successful, logged in',
    data: result,
  });
});

/** POST /api/v1/auth/2fa/send-otp — sends OTP to user email to enable 2FA */
export const sendTwoFactorOtp = asyncHandler(async (req, res) => {
  const result = await authService.sendTwoFactorEnableOtp(req.user);

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
});

/** POST /api/v1/auth/2fa/verify-enable — verifies OTP and enables 2FA on account */
export const verifyAndEnableTwoFactor = asyncHandler(async (req, res) => {
  const result = await authService.verifyAndEnableTwoFactor(req.user, req.body.code);

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
});

/** POST /api/v1/auth/2fa/disable — disables 2FA on account */
export const disableTwoFactor = asyncHandler(async (req, res) => {
  const result = await authService.disableTwoFactor(req.user);

  res.status(200).json({
    success: true,
    message: result.message,
    data: result,
  });
});

/** POST /api/v1/auth/refresh — rotates the refresh token. */
export const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body, {
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    message: 'Tokens refreshed successfully',
    data: result,
  });
});

/** POST /api/v1/auth/logout — logout from current device */
export const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout(req.user, {
    refreshToken: req.body?.refreshToken,
    accessToken: req.token,
    tokenPayload: req.tokenPayload,
    requestId: req.requestId,
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully from this device',
    data: result,
  });
});

/** POST /api/v1/auth/logout-all — logout from all devices */
export const logoutAll = asyncHandler(async (req, res) => {
  const result = await authService.logoutAll(req.user, {
    accessToken: req.token,
    tokenPayload: req.tokenPayload,
    requestId: req.requestId,
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully from all devices',
    data: result,
  });
});

/** GET /api/v1/auth/me */
export const me = asyncHandler(async (req, res) => {
  const result = authService.me(req.user);

  res.status(200).json({
    success: true,
    message: 'Current user fetched successfully',
    data: result,
  });
});

export default {
  register,
  login,
  loginConfirm,
  sendTwoFactorOtp,
  verifyAndEnableTwoFactor,
  disableTwoFactor,
  refresh,
  logout,
  logoutAll,
  me,
};
