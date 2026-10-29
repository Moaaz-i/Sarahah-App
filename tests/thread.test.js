import { describe, it, expect, beforeEach } from 'vitest';
import { api, createUser } from './helpers.js';

describe('Two-Way Anonymous Thread & Clues', () => {
  let recipient;
  let auth;

  beforeEach(async () => {
    recipient = await createUser({ username: 'thread_user', isReceivingMessages: true });
    const login = await api.post('/api/v1/auth/login').send({
      identifier: 'thread_user',
      password: 'Password123',
    });
    auth = { Authorization: `Bearer ${login.body.data.accessToken}` };
  });

  it('generates a conversationKey and accepts identityClue', async () => {
    const res = await api.post('/api/v1/messages/thread_user').send({
      content: 'Hello with a clue!',
      identityClue: 'colleague',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.sent).toBe(true);
    expect(res.body.data.conversationKey).toBeTruthy();

    const conversationKey = res.body.data.conversationKey;

    // Anonymous sender can view their thread
    const threadRes = await api.get(`/api/v1/messages/thread/${conversationKey}`);
    expect(threadRes.status).toBe(200);
    expect(threadRes.body.data.thread.content).toBe('Hello with a clue!');
    expect(threadRes.body.data.thread.identityClue).toBe('colleague');
    expect(threadRes.body.data.thread.recipient.username).toBe('thread_user');
  });

  it('allows recipient to reply and sender to follow up anonymously', async () => {
    const sendRes = await api.post('/api/v1/messages/thread_user').send({
      content: 'Can you give me feedback on the design?',
      category: 'improve',
      identityClue: 'friend',
    });

    const conversationKey = sendRes.body.data.conversationKey;

    // Recipient lists inbox
    const inboxRes = await api.get('/api/v1/messages').set(auth);
    expect(inboxRes.status).toBe(200);
    const msg = inboxRes.body.data.messages[0];
    expect(msg.identityClue).toBe('friend');

    // Recipient replies
    const replyRes = await api
      .post(`/api/v1/messages/${msg._id}/reply`)
      .set(auth)
      .send({ content: 'I really loved the colors! Keep it up.', isPublic: true });

    expect(replyRes.status).toBe(200);
    expect(replyRes.body.data.message.publicReply).toBe('I really loved the colors! Keep it up.');
    expect(replyRes.body.data.message.replies).toHaveLength(1);

    // Anonymous sender reads the thread
    const threadAfterReply = await api.get(`/api/v1/messages/thread/${conversationKey}`);
    expect(threadAfterReply.status).toBe(200);
    expect(threadAfterReply.body.data.thread.replies).toHaveLength(1);
    expect(threadAfterReply.body.data.thread.replies[0].authorType).toBe('recipient');
    expect(threadAfterReply.body.data.thread.replies[0].content).toBe('I really loved the colors! Keep it up.');

    // Anonymous sender replies back
    const senderReplyRes = await api
      .post(`/api/v1/messages/thread/${conversationKey}/reply`)
      .send({ content: 'Thank you so much! That means a lot.' });

    expect(senderReplyRes.status).toBe(200);
    expect(senderReplyRes.body.data.thread.replies).toHaveLength(2);
    expect(senderReplyRes.body.data.thread.replies[1].authorType).toBe('sender');
  });
});
