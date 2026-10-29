import { Router } from 'express';
import userController from '../controllers/userController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import validate from '../middleware/validateMiddleware.js';
import { uploadAvatar } from '../middleware/avatarUploadMiddleware.js';
import {
  usernameParamSchema,
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
} from '../validators/userValidator.js';

const router = Router();

// Authenticated self-service routes (declared before /:username).
router.patch('/me', authMiddleware, validate({ body: updateProfileSchema }), userController.updateMe);
router.patch(
  '/me/password',
  authMiddleware,
  validate({ body: changePasswordSchema }),
  userController.changePassword,
);
router.delete(
  '/me',
  authMiddleware,
  validate({ body: deleteAccountSchema }),
  userController.deleteMe,
);

/**
 * PATCH /api/v1/users/me/avatar — upload an avatar image file.
 * Multer parses the multipart body; the service validates the real image bytes.
 */
router.patch('/me/avatar', authMiddleware, uploadAvatar, userController.uploadAvatar);

// Public profile (no auth). Must stay after the static /me routes.
router.get('/:username', validate({ params: usernameParamSchema }), userController.getProfile);

export default router;
