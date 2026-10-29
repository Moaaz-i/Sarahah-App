import { describe, it, expect, afterEach } from 'vitest';
import { api, createUser, authHeaderFor, createAdmin, createMessage } from './helpers.js';

describe('Security', () => {
  afterEach(() => {
    // Make sure rate limiting stays off for the other tests.
    delete process.env.RATE_LIMIT_ENABLED;
  });

  describe('Security headers & basics', () => {
    it('sets hardened HTTP headers (helmet)', async () => {
      const res = await api.get('/health');

      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeTruthy();
      expect(res.headers['referrer-policy']).toBeTruthy();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('returns a consistent health check payload without internals', async () => {
      const res = await api.get('/health');

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(JSON.stringify(res.body)).not.toMatch(/mongo|secret|password|version/i);
    });

    it('serves the OpenAPI contract without crashing', async () => {
      const res = await api.get('/api/v1/openapi.yaml');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/yaml');
      expect(res.text).toContain('openapi: 3.0.3');
      expect(res.text).toContain('/api/v1/messages/{username}');
    });

    it('returns the unified error envelope for unknown routes', async () => {
      const res = await api.get('/api/v1/does-not-exist');

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expect(res.body.requestId).toBeTruthy();
    });

    it('echoes the X-Request-Id header', async () => {
      const res = await api.get('/health').set('X-Request-Id', 'test-request-id-1234');
      expect(res.headers['x-request-id']).toBe('test-request-id-1234');
    });
  });

  describe('NoSQL injection', () => {
    it('rejects operator objects in the login body', async () => {
      await createUser({ username: 'inject_target', email: 'inject@example.com' });

      const res = await api.post('/api/v1/auth/login').send({
        identifier: { $ne: '' },
        password: { $ne: '' },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('strips $-operators that sneak into the query string', async () => {
      const { authorization } = await authHeaderFor();

      const res = await api
        .get('/api/v1/messages?limit[$gt]=0')
        .set(authorization);

      // The injected operator key is dropped; the default limit applies.
      expect(res.status).toBe(200);
      expect(res.body.data.pagination.limit).toBe(20);
    });

    it('ignores $-operators in the request body of a message', async () => {
      const res = await api.post('/api/v1/messages/ghost_user').send({
        content: { $gt: '' },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Response hygiene', () => {
    it('never returns the password hash or tokens in user responses', async () => {
      const { authorization } = await authHeaderFor();

      const me = await api.get('/api/v1/auth/me').set(authorization);
      const raw = JSON.stringify(me.body);

      expect(raw).not.toContain('password');
      expect(raw).not.toMatch(/"tokenHash"/);
      expect(raw).not.toMatch(/token/i);
    });

    it('does not leak stack traces in the response body for handled errors', async () => {
      const res = await api.get('/api/v1/users/x!y@z');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain('at Object');
    });
  });

  describe('Rate limiting', () => {
    it('returns 429 with the unified envelope once the login limit is exceeded', async () => {
      process.env.RATE_LIMIT_ENABLED = 'true';

      // The login limiter allows RATE_LIMIT_AUTH_MAX attempts per window.
      const max = Number(process.env.RATE_LIMIT_AUTH_MAX || 20);

      let lastStatus = 0;
      for (let i = 0; i < max + 2; i += 1) {
        const res = await api.post('/api/v1/auth/login').send({
          identifier: 'nobody@example.com',
          password: 'WrongPass123',
        });
        lastStatus = res.status;
        if (res.status === 429) break;
      }

      expect(lastStatus).toBe(429);

      const throttled = await api.post('/api/v1/auth/login').send({
        identifier: 'nobody@example.com',
        password: 'WrongPass123',
      });
      expect(throttled.status).toBe(429);
      expect(throttled.body.code).toBe('RATE_LIMITED');
      expect(throttled.body.success).toBe(false);
    });
  });

  describe('Authorization boundaries', () => {
    it('blocks a regular user from the admin endpoints', async () => {
      const { authorization } = await authHeaderFor();

      const stats = await api.get('/api/v1/admin/stats').set(authorization);
      const users = await api.get('/api/v1/admin/users').set(authorization);
      const logs = await api.get('/api/v1/admin/audit-logs').set(authorization);

      expect(stats.status).toBe(403);
      expect(users.status).toBe(403);
      expect(logs.status).toBe(403);
    });

    it('blocks an anonymous caller from the admin endpoints', async () => {
      const res = await api.get('/api/v1/admin/stats');
      expect(res.status).toBe(401);
    });

    it('returns real stats to an admin (no counters are broken)', async () => {
      const admin = await createAdmin();
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { sub: String(admin._id), role: admin.role, type: 'access' },
        process.env.JWT_ACCESS_SECRET,
        {
          expiresIn: '15m',
          issuer: process.env.JWT_ISSUER || 'sarhny-api',
          audience: process.env.JWT_AUDIENCE || 'sarhny-app',
          algorithm: 'HS256',
        },
      );

      const { createMessage } = await import('./helpers.js');
      await createMessage(admin._id, { content: 'counted' });

      const res = await api.get('/api/v1/admin/stats').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.stats.users).toBe(1);
      expect(res.body.data.stats.messages).toBe(1);
      expect(res.body.data.stats.reports).toBe(0);
    });

    it('allows an admin through and hides nothing sensitive in the users list', async () => {      const admin = await createAdmin();
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { sub: String(admin._id), role: admin.role, type: 'access' },
        process.env.JWT_ACCESS_SECRET,
        {
          expiresIn: '15m',
          issuer: process.env.JWT_ISSUER || 'sarhny-api',
          audience: process.env.JWT_AUDIENCE || 'sarhny-app',
          algorithm: 'HS256',
        },
      );

      const res = await api.get('/api/v1/admin/users').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('password');
      expect(raw).not.toContain('deletedAt');
    });

    it('an admin cannot be promoted from a public endpoint', async () => {
      const { authorization, user } = await authHeaderFor();

      const res = await api
        .patch('/api/v1/users/me')
        .set(authorization)
        .send({ role: 'admin' });

      expect(res.status).toBe(400);

      const { default: User } = await import('../src/models/User.js');
      const doc = await User.findById(user._id);
      expect(doc.role).toBe('user');
    });

    it('allows an admin to permanently delete a user and cascades their content', async () => {
      const admin = await createAdmin();
      const targetUser = await createUser({ username: 'to_be_deleted' });
      await createMessage(targetUser._id, { content: 'Message for deleted user' });

      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { sub: String(admin._id), role: admin.role, type: 'access' },
        process.env.JWT_ACCESS_SECRET,
        {
          expiresIn: '15m',
          issuer: process.env.JWT_ISSUER || 'sarhny-api',
          audience: process.env.JWT_AUDIENCE || 'sarhny-app',
          algorithm: 'HS256',
        },
      );

      const res = await api
        .delete(`/api/v1/admin/users/${targetUser._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { default: User } = await import('../src/models/User.js');
      const { default: Message } = await import('../src/models/Message.js');
      expect(await User.findById(targetUser._id)).toBeNull();
      expect(await Message.countDocuments({ recipient: targetUser._id })).toBe(0);
    });
  });

  describe('Payload limits', () => {
    it('rejects oversized request bodies', async () => {
      const res = await api.post('/api/v1/auth/login').send({
        identifier: 'x'.repeat(200),
        password: 'y'.repeat(60 * 1024),
      });

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects malformed JSON', async () => {
      const res = await api
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"identifier": ');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BAD_REQUEST');
    });
  });
});
