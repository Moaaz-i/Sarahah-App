import { describe, it, expect } from 'vitest';
import { api, createUser, createMessage, authHeaderFor, createAdmin } from './helpers.js';
import AuditLog from '../src/models/AuditLog.js';
import Report from '../src/models/Report.js';

describe('Reports', () => {
  describe('POST /api/v1/reports', () => {
    it('accepts an anonymous report and keeps reporter null (no fake identity)', async () => {
      const owner = await createUser({ username: 'report_target' });
      const message = await createMessage(owner._id, { content: 'abusive content' });

      const res = await api.post('/api/v1/reports').send({
        messageId: String(message._id),
        reason: 'harassment',
        details: 'insults',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.report.reporter).toBeNull();
      expect(res.body.data.report.reason).toBe('harassment');
      expect(res.body.data.report.status).toBe('pending');

      // Nothing about the reporter is ever exposed.
      expect(JSON.stringify(res.body)).not.toMatch(/fingerprint|ip/i);
    });

    it('accepts a report from a logged-in user and stores the reporter', async () => {
      const owner = await createUser({ username: 'report_target_2' });
      const message = await createMessage(owner._id, { content: 'spam content' });
      const { authorization } = await authHeaderFor();

      const res = await api
        .post('/api/v1/reports')
        .set(authorization)
        .send({ messageId: String(message._id), reason: 'spam' });

      expect(res.status).toBe(201);
      expect(res.body.data.report.reporter).toBeTruthy();
    });

    it('rejects an invalid reason', async () => {
      const owner = await createUser({ username: 'report_target_3' });
      const message = await createMessage(owner._id, { content: 'content' });

      const res = await api.post('/api/v1/reports').send({
        messageId: String(message._id),
        reason: 'because_i_said_so',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a report about a non-existent message', async () => {
      const res = await api.post('/api/v1/reports').send({
        messageId: 'a'.repeat(24),
        reason: 'spam',
      });

      expect(res.status).toBe(404);
    });

    it('blocks duplicate reports from the same source within 24h', async () => {
      const owner = await createUser({ username: 'report_target_4' });
      const message = await createMessage(owner._id, { content: 'dup content' });

      const first = await api.post('/api/v1/reports').send({
        messageId: String(message._id),
        reason: 'spam',
      });
      expect(first.status).toBe(201);

      const duplicate = await api.post('/api/v1/reports').send({
        messageId: String(message._id),
        reason: 'spam',
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('DUPLICATE_REPORT');
    });
  });

  describe('Report review (admin only)', () => {
    it('blocks non-admins from listing reports', async () => {
      const { authorization } = await authHeaderFor();

      const res = await api.get('/api/v1/reports').set(authorization);
      expect(res.status).toBe(403);
    });

    it('blocks anonymous users from listing reports', async () => {
      const res = await api.get('/api/v1/reports');
      expect(res.status).toBe(401);
    });

    it('lets an admin list reports, filter them and read one report', async () => {
      const owner = await createUser({ username: 'report_admin_target' });
      const message = await createMessage(owner._id, { content: 'moderate me' });

      await api.post('/api/v1/reports').send({
        messageId: String(message._id),
        reason: 'threats',
        details: 'details here',
      });

      const admin = await createAdmin();
      const { tokens } = await authHeaderFor(); // creates a normal user token...
      const jwt = await import('jsonwebtoken');
      const adminToken = jwt.default.sign(
        { sub: String(admin._id), role: admin.role, type: 'access' },
        process.env.JWT_ACCESS_SECRET,
        {
          expiresIn: '15m',
          issuer: process.env.JWT_ISSUER || 'sarhny-api',
          audience: process.env.JWT_AUDIENCE || 'sarhny-app',
          algorithm: 'HS256',
        },
      );
      expect(tokens).toBeTruthy(); // token pair was issued for the normal user

      const list = await api.get('/api/v1/reports').set('Authorization', `Bearer ${adminToken}`);
      expect(list.status).toBe(200);
      expect(list.body.data.reports).toHaveLength(1);

      const filtered = await api
        .get('/api/v1/reports?status=pending&reason=threats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(filtered.status).toBe(200);
      expect(filtered.body.data.reports).toHaveLength(1);

      const invalidFilter = await api
        .get('/api/v1/reports?status=whatever')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(invalidFilter.status).toBe(400);

      const single = await api
        .get(`/api/v1/reports/${list.body.data.reports[0].id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(single.status).toBe(200);
      expect(single.body.data.report.message).toBeTruthy();
    });

    it('updates the status, records reviewedBy/reviewedAt and writes an audit log', async () => {
      const owner = await createUser({ username: 'report_status_target' });
      const message = await createMessage(owner._id, { content: 'status content' });

      await api.post('/api/v1/reports').send({
        messageId: String(message._id),
        reason: 'spam',
      });

      const admin = await createAdmin();
      const jwt = await import('jsonwebtoken');
      const adminToken = jwt.default.sign(
        { sub: String(admin._id), role: admin.role, type: 'access' },
        process.env.JWT_ACCESS_SECRET,
        {
          expiresIn: '15m',
          issuer: process.env.JWT_ISSUER || 'sarhny-api',
          audience: process.env.JWT_AUDIENCE || 'sarhny-app',
          algorithm: 'HS256',
        },
      );

      const report = await Report.findOne({});

      const res = await api
        .patch(`/api/v1/reports/${report._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(200);
      expect(res.body.data.report.status).toBe('resolved');
      expect(res.body.data.report.reviewedBy).toBe(String(admin._id));
      expect(res.body.data.report.reviewedAt).toBeTruthy();

      // Audit entry exists and contains no secrets.
      const log = await AuditLog.findOne({ action: 'report.status_changed' });
      expect(log).toBeTruthy();
      expect(String(log.actor)).toBe(String(admin._id));
      expect(log.metadata).toMatchObject({ from: 'pending', to: 'resolved' });
      expect(JSON.stringify(log.toObject())).not.toMatch(/password|token/i);
    });

    it('rejects an invalid status value', async () => {
      const admin = await createAdmin();
      const jwt = await import('jsonwebtoken');
      const adminToken = jwt.default.sign(
        { sub: String(admin._id), role: admin.role, type: 'access' },
        process.env.JWT_ACCESS_SECRET,
        {
          expiresIn: '15m',
          issuer: process.env.JWT_ISSUER || 'sarhny-api',
          audience: process.env.JWT_AUDIENCE || 'sarhny-app',
          algorithm: 'HS256',
        },
      );

      const report = await Report.create({
        message: (await createMessage(admin._id, { content: 'x' }))._id,
        reason: 'spam',
      });

      const res = await api
        .patch(`/api/v1/reports/${report._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'obliterated' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
