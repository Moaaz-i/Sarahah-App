import asyncHandler from '../utils/asyncHandler.js';
import * as userService from '../services/userService.js';

/** GET /api/v1/users/:username — public profile. */
export const getProfile = asyncHandler(async (req, res) => {
  const result = await userService.getPublicProfile(req.params.username);

  res.status(200).json({
    success: true,
    message: 'Profile fetched successfully',
    data: result,
  });
});

/** PATCH /api/v1/users/me — update own profile (whitelisted fields only). */
export const updateMe = asyncHandler(async (req, res) => {
  const result = await userService.updateProfile(req.user._id, req.body);

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: result,
  });
});

/** PATCH /api/v1/users/me/password */
export const changePassword = asyncHandler(async (req, res) => {
  const result = await userService.changePassword(req.user._id, req.body, {
    requestId: req.requestId,
  });

  res.status(200).json({
    success: true,
    message: 'Password changed successfully, other sessions were revoked',
    data: result,
  });
});

/** DELETE /api/v1/users/me — documented deletion policy, returns the policy. */
export const deleteMe = asyncHandler(async (req, res) => {
  const result = await userService.deleteAccount(req.user, req.body, {
    requestId: req.requestId,
  });

  res.status(200).json({
    success: true,
    message: 'Account deleted',
    data: result,
  });
});

export default { getProfile, updateMe, changePassword, deleteMe };
