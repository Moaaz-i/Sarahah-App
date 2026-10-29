import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import env from './config/env.js';
import apiRouter from './routes/index.js';
import requestIdMiddleware from './middleware/requestIdMiddleware.js';
import requestLoggerMiddleware from './middleware/requestLoggerMiddleware.js';
import { sanitizeInput } from './middleware/validateMiddleware.js';
import { globalLimiter } from './middleware/rateLimitMiddleware.js';
import notFoundMiddleware from './middleware/notFoundMiddleware.js';
import errorMiddleware from './middleware/errorMiddleware.js';

// ESM has no __dirname; derive it from this module's URL.
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Express application assembly.
 * IMPORTANT: this file must NOT connect to the database or listen on a port,
 * so tests can import `app` and drive it with supertest in isolation.
 */
const app = express();

// We sit behind a reverse proxy in production; keep this conservative.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// 1. Security headers.
app.use(helmet());

// 2. CORS: explicit allow-list from the environment (empty list = no origins).
app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin / server-to-server requests (no Origin header).
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true, // needed for the OAuth flow cookie on cross-origin SPA calls
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
  }),
);

// 3. Body size limits: allow up to 10MB for message sending (voice notes / multimedia),
// while maintaining a strict 50KB limit on authentication and other endpoints.
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path.startsWith('/api/v1/messages/')) {
    return express.json({ limit: '10mb' })(req, res, next);
  }
  return express.json({ limit: '50kb' })(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

// 3b. Cookies (unsigned parsing only): the OAuth flow cookie carries its own
//     HMAC signature, which is verified with the dedicated secret in
//     utils/oauthFlow.js rather than with cookie-parser's signing.
app.use(cookieParser());

// 4. Request id + logging (never logs bodies, tokens or message content).
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

// 5. Global NoSQL-injection sanitizer for body/query/params.
app.use(sanitizeInput);

// 6. Global rate limit safety net (per-route limiters are stricter).
app.use('/api/v1', globalLimiter());

// 7. Health check: reveals nothing beyond liveness.
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Service is healthy',
    data: { status: 'ok', uptime: Math.round(process.uptime()) },
  });
});

// 7b. API contract (static file, no dynamic generation involved).
app.get('/api/v1/openapi.yaml', (req, res) => {
  res.type('text/yaml').send(readFileSync(join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8'));
});

// 8. API routes under /api/v1.
app.use('/api/v1', apiRouter);

// 8b. Serve uploaded avatars. Nosniff + long cache so a user-uploaded image
//     can never be interpreted as HTML/JS, and the browser caches it hard.
app.use(
  '/uploads',
  express.static(join(__dirname, '..', 'uploads'), {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }),
);

// 9. 404 for unknown routes.
app.use(notFoundMiddleware);

// 10. Global error handler (always last).
app.use(errorMiddleware);

export default app;
