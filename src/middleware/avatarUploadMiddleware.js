import multer from 'multer';
import path from 'node:path';
import AppError from '../utils/AppError.js';
import { MAX_AVATAR_BYTES, UPLOADABLE_MIME_LIST } from '../utils/imageRef.js';
import { verifyFileIntegrity, ALLOWED_EXTENSIONS } from '../utils/fileIntegrity.js';

/**
 * Multer-based avatar upload middleware with Magic Number & Integrity Verification.
 *
 * 1. fileFilter:
 *    - Rejects disallowed MIME types.
 *    - Rejects disallowed file extensions.
 *    - Detects null byte injection and double extensions (e.g. avatar.php.png).
 * 2. Magic Number & Deep Structural Inspection:
 *    - Runs immediately after buffer receipt.
 *    - Detects magic byte headers (PNG, JPEG, GIF, WebP).
 *    - Scans for polyglots, embedded PHP/HTML/JS scripts, and executable headers.
 *    - Confirms that declared MIME and extension match binary content.
 */
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Check for null bytes in filename
  if (/[\u0000]/.test(file.originalname)) {
    return cb(AppError.badRequest('File name contains forbidden null bytes'), false);
  }

  // Check declared MIME
  if (!UPLOADABLE_MIME_LIST.includes(file.mimetype)) {
    return cb(
      AppError.badRequest('Only PNG, JPEG, GIF or WebP images are allowed as an avatar'),
      false,
    );
  }

  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      AppError.badRequest(`File extension "${ext}" is not allowed. Only .png, .jpg, .jpeg, .gif, .webp are accepted.`),
      false,
    );
  }

  // Check double extensions
  const parts = path.basename(file.originalname).split('.');
  if (parts.length > 2) {
    const suspectExtensions = ['php', 'phtml', 'html', 'htm', 'js', 'sh', 'exe', 'bat', 'cmd', 'svg'];
    for (let i = 1; i < parts.length - 1; i++) {
      if (suspectExtensions.includes(parts[i].toLowerCase())) {
        return cb(
          AppError.badRequest('Double file extension detected with executable or script format'),
          false,
        );
      }
    }
  }

  cb(null, true);
};

const multerInstance = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_AVATAR_BYTES },
}).single('avatar');

export const uploadAvatar = (req, res, next) => {
  multerInstance(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(AppError.badRequest(`File exceeds maximum size of ${MAX_AVATAR_BYTES / (1024 * 1024)}MB`));
      }
      return next(err);
    }

    if (req.file) {
      try {
        // Deep magic number & tampering verification
        const detected = verifyFileIntegrity(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
        );
        req.file.detected = detected;
      } catch (validationErr) {
        return next(validationErr);
      }
    }

    next();
  });
};

export default { uploadAvatar, fileFilter };

