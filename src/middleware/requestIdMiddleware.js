import crypto from 'node:crypto';

/** Only adopt an incoming id if it looks sane (prevents log injection). */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Assigns a request id:
 * - reuses the incoming X-Request-Id header when it is well-formed,
 * - otherwise generates a new UUID,
 * - attaches it to req.requestId, the response header and the logs.
 */
const requestIdMiddleware = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.requestId =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
      ? incoming
      : crypto.randomUUID();

  res.setHeader('X-Request-Id', req.requestId);
  next();
};

export default requestIdMiddleware;
