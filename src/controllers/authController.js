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
    message: 'Logged in successfully',
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

/** POST /api/v1/auth/logout */
export const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout(req.user, req.body?.refreshToken);

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
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

export default { register, login, refresh, logout, me };
