import { describe, it, expect, beforeEach } from 'vitest';
import { api, createUser, createMessage } from './helpers.js';

describe('Messages', () => {
  let owner;
  let auth;

  // NOTE: the global test setup wipes the database before EVERY test,
  // so fixtures must be created in beforeEach (not beforeAll).
  beforeEach(async () => {
    owner = await createUser({ username: 'inbox_owner', isReceivingMessages: true });

    // Log in through the API so the token belongs to the inbox owner.
    const login = await api.post('/api/v1/auth/login').send({
      identifier: 'inbox_owner',
      password: 'Password123',
    });
    expect(login.status).toBe(200);
    auth = { Authorization: `Bearer ${login.body.data.accessToken}` };
  });

  describe('POST /api/v1/messages/:username', () => {
    it('accepts an anonymous message and stores no sender identity', async () => {
      const res = await api
        .post('/api/v1/messages/inbox_owner')
        .send({ content: 'You are doing great!' });

      expect(res.status).toBe(201);
      expect(res.body.data.sent).toBe(true);

      const { default: Message } = await import('../src/models/Message.js');
      const stored = await Message.findOne({ content: 'You are doing great!' });
      expect(stored).toBeTruthy();
      expect(String(stored.recipient)).toBe(String(owner._id));

      // No sender field exists at all.
      const raw = JSON.stringify(stored.toObject());
      expect(raw).not.toMatch(/"sender|"from"|"ip"|"ipAddress"|"userAgent"|"fingerprint"/i);
    });

    it('does not reveal whether the recipient exists', async () => {
      const unknown = await api.post('/api/v1/messages/ghost_user').send({ content: 'hi' });
      await createUser({ username: 'closed_user', isReceivingMessages: false });
      const closed = await api.post('/api/v1/messages/closed_user').send({ content: 'hi' });

      expect(unknown.status).toBe(404);
      expect(closed.status).toBe(404);
      expect(unknown.body.message).toBe(closed.body.message);
    });

    it('rejects an empty or too-long message', async () => {
      const empty = await api.post('/api/v1/messages/inbox_owner').send({ content: '   ' });
      const tooLong = await api
        .post('/api/v1/messages/inbox_owner')
        .send({ content: 'x'.repeat(2001) });

      expect(empty.status).toBe(400);
      expect(tooLong.status).toBe(400);
      expect(empty.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown body fields', async () => {
      const res = await api
        .post('/api/v1/messages/inbox_owner')
        .send({ content: 'hi', senderEmail: 'me@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/messages', () => {
    it('only returns the authenticated user messages', async () => {
      const other = await createUser({ username: 'other_owner' });

      await createMessage(owner._id, { content: 'mine-1' });
      await createMessage(other._id, { content: 'theirs-1' });

      const res = await api.get('/api/v1/messages').set(auth);

      expect(res.status).toBe(200);
      const contents = res.body.data.messages.map((m) => m.content);
      expect(contents).toContain('mine-1');
      expect(contents).not.toContain('theirs-1');
    });

    it('paginates with a cursor and sorts newest first', async () => {
      for (let i = 0; i < 5; i += 1) {
        await createMessage(owner._id, { content: `paged-${i}` });
      }

      const first = await api.get('/api/v1/messages?limit=2').set(auth);
      expect(first.status).toBe(200);
      expect(first.body.data.messages).toHaveLength(2);
      expect(first.body.data.pagination.hasMore).toBe(true);

      const contents = first.body.data.messages.map((m) => m.content);
      expect(contents[0]).toBe('paged-4'); // newest first

      const second = await api
        .get(`/api/v1/messages?limit=2&cursor=${first.body.data.pagination.nextCursor}`)
        .set(auth);

      expect(second.status).toBe(200);
      const secondContents = second.body.data.messages.map((m) => m.content);
      expect(secondContents).not.toContain('paged-4');
      expect(secondContents).toContain('paged-2');
    });

    it('filters by isRead / isArchived with whitelisted values only', async () => {
      await createMessage(owner._id, { content: 'read-one', isRead: true, readAt: new Date() });
      await createMessage(owner._id, { content: 'archived-one', isArchived: true, archivedAt: new Date() });

      const read = await api.get('/api/v1/messages?isRead=true').set(auth);
      const archived = await api.get('/api/v1/messages?isArchived=true').set(auth);
      const invalid = await api.get('/api/v1/messages?isRead=maybe').set(auth);

      expect(read.status).toBe(200);
      expect(read.body.data.messages.every((m) => m.isRead)).toBe(true);
      expect(archived.body.data.messages.every((m) => m.isArchived)).toBe(true);
      expect(invalid.status).toBe(400);
    });

    it('requires authentication', async () => {
      const res = await api.get('/api/v1/messages');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/messages/:id', () => {
    it('returns a message to its owner', async () => {
      const message = await createMessage(owner._id, { content: 'owner-only' });

      const res = await api.get(`/api/v1/messages/${message._id}`).set(auth);
      expect(res.status).toBe(200);
      expect(res.body.data.message.content).toBe('owner-only');
    });

    it('returns 404 (not 403) for another user message id', async () => {
      const stranger = await createUser({ username: 'stranger_owner' });
      const message = await createMessage(stranger._id, { content: 'not-yours' });

      const res = await api.get(`/api/v1/messages/${message._id}`).set(auth);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/messages/:id/read', () => {
    it('marks the message as read and sets readAt', async () => {
      const message = await createMessage(owner._id, { content: 'to-read' });

      const res = await api.patch(`/api/v1/messages/${message._id}/read`).set(auth);

      expect(res.status).toBe(200);
      expect(res.body.data.message.isRead).toBe(true);
      expect(res.body.data.message.readAt).toBeTruthy();
    });

    it('cannot mark someone else message', async () => {
      const stranger = await createUser({ username: 'stranger_two' });
      const message = await createMessage(stranger._id, { content: 'not-yours-either' });

      const res = await api.patch(`/api/v1/messages/${message._id}/read`).set(auth);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/messages/:id/archive', () => {
    it('archives and unarchives', async () => {
      const message = await createMessage(owner._id, { content: 'to-archive' });

      const archived = await api
        .patch(`/api/v1/messages/${message._id}/archive`)
        .set(auth)
        .send({ archived: true });

      expect(archived.status).toBe(200);
      expect(archived.body.data.message.isArchived).toBe(true);
      expect(archived.body.data.message.archivedAt).toBeTruthy();

      const unarchived = await api
        .patch(`/api/v1/messages/${message._id}/archive`)
        .set(auth)
        .send({ archived: false });

      expect(unarchived.body.data.message.isArchived).toBe(false);
      expect(unarchived.body.data.message.archivedAt).toBeNull();
    });

    it('cannot archive someone else message', async () => {
      const stranger = await createUser({ username: 'stranger_three' });
      const message = await createMessage(stranger._id, { content: 'nope' });

      const res = await api
        .patch(`/api/v1/messages/${message._id}/archive`)
        .set(auth)
        .send({ archived: true });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/messages/:id', () => {
    it('performs a logical delete and hides the message from the inbox', async () => {
      const message = await createMessage(owner._id, { content: 'to-delete' });

      const res = await api.delete(`/api/v1/messages/${message._id}`).set(auth);
      expect(res.status).toBe(200);

      const inbox = await api.get('/api/v1/messages?limit=50').set(auth);
      const ids = inbox.body.data.messages.map((m) => String(m._id));
      expect(ids).not.toContain(String(message._id));

      // The row still exists (logical delete).
      const { default: Message } = await import('../src/models/Message.js');
      const doc = await Message.findById(message._id);
      expect(doc.isDeleted).toBe(true);
    });

    it('cannot delete someone else message', async () => {
      const stranger = await createUser({ username: 'stranger_four' });
      const message = await createMessage(stranger._id, { content: 'keep-it' });

      const res = await api.delete(`/api/v1/messages/${message._id}`).set(auth);
      expect(res.status).toBe(404);

      const { default: Message } = await import('../src/models/Message.js');
      const doc = await Message.findById(message._id);
      expect(doc.isDeleted).toBe(false);
    });
  });
});
