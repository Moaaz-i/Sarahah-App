import env from '../config/env.js';

/**
 * Minimal request logger.
 * - Logs method, path, status, duration and the request id.
 * - Never logs bodies, query strings with values, cookies or auth headers.
 * - Disabled in the test environment to keep test output clean.
 */
const requestLoggerMiddleware = (req, res, next) => {
  if (env.isTest) return next();

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.baseUrl}${req.path} ` +
        `${res.statusCode} ${durationMs.toFixed(1)}ms rid=${req.requestId}`,
    );
  });

  next();
};

export default requestLoggerMiddleware;
