import { ERROR_CODES, ERROR_MESSAGES } from '../constants/messages.js';
import env from '../config/env.js';

/**
 * Global error handler (must be registered last).
 * - Normalizes every error into the unified error envelope.
 * - Hides stack traces, MongoDB messages and internal details in production.
 * - Supports: AppError, Zod errors, Mongoose validation/cast/duplicate-key,
 *   JWT errors and body-parser "payload too large".
 */
const errorMiddleware = (err, req, res, next) => {
  // eslint-disable-next-line no-unused-vars -- express requires 4 args
  if (res.headersSent) return next(err);

  const requestId = req.requestId ?? null;
  const base = { success: false, requestId };

  // --- Operational AppError -------------------------------------------------
  if (err?.isOperational) {
    return res.status(err.statusCode).json({
      ...base,
      message: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // --- Zod validation error -------------------------------------------------
  if (err?.name === 'ZodError' || err?.constructor?.name === 'ZodError') {
    return res.status(400).json({
      ...base,
      message: ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR],
      code: ERROR_CODES.VALIDATION_ERROR,
      details: (err.issues || []).map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    });
  }

  // --- Mongoose validation error -------------------------------------------
  if (err?.name === 'ValidationError' && err?.errors) {
    const details = Object.entries(err.errors).map(([field, e]) => ({
      field,
      message: e.message,
    }));
    return res.status(400).json({
      ...base,
      message: ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR],
      code: ERROR_CODES.VALIDATION_ERROR,
      details,
    });
  }

  // --- Mongoose cast error (bad ObjectId etc.) ------------------------------
  if (err?.name === 'CastError') {
    return res.status(400).json({
      ...base,
      message: 'Invalid value for a resource identifier',
      code: ERROR_CODES.BAD_REQUEST,
    });
  }

  // --- MongoDB duplicate key ------------------------------------------------
  if (err?.code === 11000) {
    const fields = Object.keys(err.keyValue || {});
    const code = fields.includes('username')
      ? ERROR_CODES.USERNAME_TAKEN
      : fields.includes('email')
        ? ERROR_CODES.EMAIL_TAKEN
        : ERROR_CODES.CONFLICT;

    return res.status(409).json({
      ...base,
      message: ERROR_MESSAGES[code] || 'Duplicate value',
      code,
      details: fields.length ? { fields } : undefined,
    });
  }

  // --- Body parser: payload too large --------------------------------------
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      ...base,
      message: ERROR_MESSAGES[ERROR_CODES.PAYLOAD_TOO_LARGE],
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
    });
  }

  // --- Malformed JSON body --------------------------------------------------
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      ...base,
      message: 'Malformed JSON in request body',
      code: ERROR_CODES.BAD_REQUEST,
    });
  }

  // --- Unexpected error -----------------------------------------------------
  console.error(`[error] [${requestId}]`, err);

  return res.status(500).json({
    ...base,
    message: err?.message || ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR],
    code: ERROR_CODES.INTERNAL_ERROR,
    details: err?.stack ? err.stack.split('\n').slice(0, 3) : undefined,
  });
};

export default errorMiddleware;
