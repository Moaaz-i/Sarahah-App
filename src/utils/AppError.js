import { ERROR_CODES, ERROR_MESSAGES } from '../constants/messages.js';

/**
 * Operational error that is safe to show to the client.
 * Anything thrown that is NOT an AppError is treated as unexpected
 * and is hidden behind a generic 500 response in production.
 */
export default class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message || ERROR_MESSAGES[code] || 'Unexpected error');
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message, details) {
    return new AppError(400, ERROR_CODES.BAD_REQUEST, message, details);
  }

  static validation(details, message) {
    return new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, details);
  }

  static unauthenticated(message, code = ERROR_CODES.UNAUTHENTICATED) {
    return new AppError(401, code, message);
  }

  static forbidden(message, code = ERROR_CODES.FORBIDDEN) {
    return new AppError(403, code, message);
  }

  static notFound(message) {
    return new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(code, message, details) {
    return new AppError(409, code, message, details);
  }

  static tooManyRequests(message) {
    return new AppError(429, ERROR_CODES.RATE_LIMITED, message);
  }

  static internal(message) {
    return new AppError(500, ERROR_CODES.INTERNAL_ERROR, message);
  }
}
