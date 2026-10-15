import mongoose from 'mongoose';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';

/**
 * Input validation + NoSQL-injection hardening.
 *
 * Usage:  router.post('/', validate({ body: myZodSchema }), controller)
 *
 * - Strips MongoDB operators ($where, $gt, ...) and dotted keys from
 *   body/query/params BEFORE validation (prevents NoSQL injection).
 * - Schemas should use .strict() so unknown fields are rejected instead
 *   of silently reaching the database.
 */

const FORBIDDEN_KEY = /^(\$|.*\.)/;

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const sanitizeObject = (input) => {
  if (!isPlainObject(input)) return input;

  const clean = {};
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_KEY.test(key)) continue; // drop $-operators and dotted keys

    if (isPlainObject(value)) {
      const nested = sanitizeObject(value);
      // A nested object left empty means every key was an injected operator:
      // drop it entirely so the field falls back to its default/absent state.
      if (Object.keys(nested).length === 0) continue;
      clean[key] = nested;
      continue;
    }

    clean[key] = value;
  }
  return clean;
};

const sanitizeArray = (input) =>
  Array.isArray(input) ? input.map((item) => sanitizeObject(item)) : input;

/** Recursively remove forbidden keys from body/query/params. */
export const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = Array.isArray(req.body) ? sanitizeArray(req.body) : sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') req.query = sanitizeObject(req.query);
  if (req.params && typeof req.params === 'object') req.params = sanitizeObject(req.params);
  next();
};

const formatIssues = (issues) =>
  issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
    code: issue.code,
  }));

const runSchema = (schema, value, location) => {
  if (!schema) return value;

  const result = schema.safeParse(value ?? (location === 'body' ? {} : {}));
  if (!result.success) {
    throw AppError.validation(formatIssues(result.error.issues));
  }
  return result.data;
};

/**
 * Validates and REPLACES req.body / req.query / req.params with the
 * parsed (and coerced/whitelisted) values, so controllers never see
 * fields that were not explicitly allowed.
 */
const validate = (schemas = {}) => (req, res, next) => {
  try {
    if (schemas.body) req.body = runSchema(schemas.body, req.body, 'body');
    if (schemas.query) req.query = runSchema(schemas.query, req.query, 'query');
    if (schemas.params) req.params = runSchema(schemas.params, req.params, 'params');
    next();
  } catch (err) {
    next(err);
  }
};

/** Helper used by validators that receive an id path param. */
export const isValidObjectId = (value) => mongoose.isValidObjectId(String(value));

export { ERROR_CODES };
export default validate;
