import { describe, it, expect, beforeEach } from 'vitest';
import { api, createUser, signTokenFor } from './helpers.js';
import Message from '../src/models/Message.js';
import IdentityRequest from '../src/models/IdentityRequest.js';
import Conversation from '../src/models/Conversation.js';
import ConversationMessage from '../src/models/ConversationMessage.js';

describe('Identity Request & Conversation Workflow', () => {
  let sender, receiver, thirdParty;
  let senderToken, receiverToken, thirdPartyToken;

  beforeEach(async () => {
    sender = await createUser({ name: 'Sender User', username: 'sender_user' });
    receiver = await createUser({ name: 'Receiver User', username: 'receiver_user' });
    thirdParty = await createUser({ name: 'Third Party', username: 'third_party' });

    senderToken = signTokenFor(sender);
    receiverToken = signTokenFor(receiver);
    thirdPartyToken = signTokenFor(thirdParty);
  });

  it('1) Send Anonymous Message: records sender if logged in, but receiver cannot know sender identity', async () => {
    // Sender sends anonymous message while authenticated
    const sendRes = await api
      .post(`/api/v1/messages/${receiver.username}`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ content: 'Hello anonymously from logged in user!' });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.success).toBe(true);

    // Verify in database: sender is recorded
    const messageInDb = await Message.findOne({ recipient: receiver._id });
    expect(messageInDb).toBeDefined();
    expect(String(messageInDb.sender)).toBe(String(sender._id));

    // Receiver views inbox: sender identity is NOT revealed
    const inboxRes = await api
      .get('/api/v1/messages')
      .set('Authorization', `Bearer ${receiverToken}`);

    expect(inboxRes.status).toBe(200);
    const msg = inboxRes.body.data.messages[0];
    expect(msg.content).toBe('Hello anonymously from logged in user!');
    expect(msg.sender).toBeUndefined(); // strictly not exposed
    expect(msg.hasSender).toBe(true); // indicates that identity can be requested
  });

  it('2) Request Sender Identity: receiver requests sender identity, status is pending', async () => {
    const sendRes = await api
      .post(`/api/v1/messages/${receiver.username}`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ content: 'Anonymous secret message' });

    const messageInDb = await Message.findOne({ recipient: receiver._id });

    // Receiver requests sender identity
    const requestRes = await api
      .post('/api/v1/identity-requests')
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({ messageId: String(messageInDb._id) });

    expect(requestRes.status).toBe(201);
    expect(requestRes.body.success).toBe(true);
    expect(requestRes.body.data.status).toBe('pending');
    expect(requestRes.body.data.sender).toBeUndefined(); // sender is hidden from receiver

    // Duplicate request should return conflict
    const dupRes = await api
      .post('/api/v1/identity-requests')
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({ messageId: String(messageInDb._id) });

    expect(dupRes.status).toBe(409);
  });

  it('Cannot request identity for guest messages with no sender', async () => {
    // Guest sends message without auth
    await api
      .post(`/api/v1/messages/${receiver.username}`)
      .send({ content: 'Guest message' });

    const guestMessage = await Message.findOne({ recipient: receiver._id });
    expect(guestMessage.sender).toBeFalsy();

    const requestRes = await api
      .post('/api/v1/identity-requests')
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({ messageId: String(guestMessage._id) });

    expect(requestRes.status).toBe(400);
    expect(requestRes.body.message).toMatch(/unregistered guest/i);
  });

  it('3) Get Requests: sender can view received requests', async () => {
    const sendRes = await api
      .post(`/api/v1/messages/${receiver.username}`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ content: 'Another anonymous note' });

    const msg = await Message.findOne({ recipient: receiver._id });

    await api
      .post('/api/v1/identity-requests')
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({ messageId: String(msg._id) });

    // Sender views requests received from other users
    const receivedRes = await api
      .get('/api/v1/identity-requests/received')
      .set('Authorization', `Bearer ${senderToken}`);

    expect(receivedRes.status).toBe(200);
    expect(receivedRes.body.data.requests.length).toBe(1);
    const reqItem = receivedRes.body.data.requests[0];
    expect(reqItem.status).toBe('pending');
    expect(reqItem.receiver.username).toBe(receiver.username);
  });

  it('4) Reject Request: sender rejects request -> sender identity remains hidden', async () => {
    await api
      .post(`/api/v1/messages/${receiver.username}`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ content: 'Keep me hidden please' });

    const msg = await Message.findOne({ recipient: receiver._id });

    const requestRes = await api
      .post('/api/v1/identity-requests')
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({ messageId: String(msg._id) });

    const requestId = requestRes.body.data._id;

    // Sender rejects
    const rejectRes = await api
      .patch(`/api/v1/identity-requests/${requestId}/respond`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ action: 'reject' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('rejected');

    // Receiver checks their sent requests -> sender is STILL hidden
    const sentRes = await api
      .get('/api/v1/identity-requests/sent')
      .set('Authorization', `Bearer ${receiverToken}`);

    expect(sentRes.status).toBe(200);
    const reqForReceiver = sentRes.body.data.requests[0];
    expect(reqForReceiver.status).toBe('rejected');
    expect(reqForReceiver.sender).toBeUndefined(); // strictly hidden
  });

  it('4 & 5) Accept Request & Create Conversation: reveals sender and links conversation', async () => {
    await api
      .post(`/api/v1/messages/${receiver.username}`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ content: 'Will you find out who I am?' });

    const msg = await Message.findOne({ recipient: receiver._id });

    const reqRes = await api
      .post('/api/v1/identity-requests')
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({ messageId: String(msg._id) });

    const requestId = reqRes.body.data._id;

    // Sender accepts request
    const acceptRes = await api
      .patch(`/api/v1/identity-requests/${requestId}/respond`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ action: 'accept' });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe('accepted');
    expect(acceptRes.body.data.conversation).toBeDefined();

    const conversationId = acceptRes.body.data.conversation._id || acceptRes.body.data.conversation;

    // Receiver checks sent requests -> sender identity IS now revealed!
    const sentRes = await api
      .get('/api/v1/identity-requests/sent')
      .set('Authorization', `Bearer ${receiverToken}`);

    expect(sentRes.status).toBe(200);
    const revealedReq = sentRes.body.data.requests[0];
    expect(revealedReq.status).toBe('accepted');
    expect(revealedReq.sender).toBeDefined();
    expect(revealedReq.sender.username).toBe(sender.username);
    expect(revealedReq.sender.name).toBe(sender.name);

    // Verify Conversation was created and linked to the original message
    const conversation = await Conversation.findById(conversationId);
    expect(conversation).toBeDefined();
    expect(String(conversation.message)).toBe(String(msg._id));
    expect(conversation.participants.map(String)).toContain(String(sender._id));
    expect(conversation.participants.map(String)).toContain(String(receiver._id));
  });

  it('6 & 7) Send & Get Conversation Messages + Authorization enforcement', async () => {
    // Setup accepted request and conversation
    await api
      .post(`/api/v1/messages/${receiver.username}`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ content: 'Chat with me!' });

    const msg = await Message.findOne({ recipient: receiver._id });

    const reqRes = await api
      .post('/api/v1/identity-requests')
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({ messageId: String(msg._id) });

    const acceptRes = await api
      .patch(`/api/v1/identity-requests/${reqRes.body.data._id}/respond`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ action: 'accept' });

    const conversationId = String(acceptRes.body.data.conversation._id || acceptRes.body.data.conversation);

    // Receiver sends message in conversation
    const sendMsg1 = await api
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({ content: 'Nice to finally know who you are!' });

    expect(sendMsg1.status).toBe(201);
    expect(sendMsg1.body.data.content).toBe('Nice to finally know who you are!');

    // Sender replies in conversation
    const sendMsg2 = await api
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ content: 'Haha, glad we can talk openly now.' });

    expect(sendMsg2.status).toBe(201);
    expect(sendMsg2.body.data.content).toBe('Haha, glad we can talk openly now.');

    // Both users can retrieve conversation messages
    const getMsgsReceiver = await api
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${receiverToken}`);

    expect(getMsgsReceiver.status).toBe(200);
    expect(getMsgsReceiver.body.data.messages.length).toBe(2);

    const getMsgsSender = await api
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${senderToken}`);

    expect(getMsgsSender.status).toBe(200);
    expect(getMsgsSender.body.data.messages.length).toBe(2);

    // AUTHORIZATION NOTE: Third party cannot access the conversation or send messages
    const thirdPartyGet = await api
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${thirdPartyToken}`);

    expect(thirdPartyGet.status).toBe(403);

    const thirdPartySend = await api
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${thirdPartyToken}`)
      .send({ content: 'Can I join this chat?' });

    expect(thirdPartySend.status).toBe(403);
  });

  it('Accepting identity request again for another message from the same sender reuses conversation without Resource conflict', async () => {
    // 1. Message 1 from sender to receiver
    await api
      .post(`/api/v1/messages/${receiver.username}`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ content: 'First anonymous message' });

    const msg1 = await Message.findOne({ recipient: receiver._id, content: 'First anonymous message' });

    const req1 = await api
      .post('/api/v1/identity-requests')
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({ messageId: String(msg1._id) });

    const accept1 = await api
      .patch(`/api/v1/identity-requests/${req1.body.data._id}/respond`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ action: 'accept' });

    expect(accept1.status).toBe(200);
    const convId1 = String(accept1.body.data.conversation._id || accept1.body.data.conversation);

    // 2. Sender sends SECOND anonymous message to same receiver
    await api
      .post(`/api/v1/messages/${receiver.username}`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ content: 'Second anonymous message from same sender' });

    const msg2 = await Message.findOne({ recipient: receiver._id, content: 'Second anonymous message from same sender' });

    // 3. Receiver requests identity for message 2
    const req2 = await api
      .post('/api/v1/identity-requests')
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({ messageId: String(msg2._id) });

    expect(req2.status).toBe(201);
    expect(req2.body.data.status).toBe('pending');

    // 4. Sender ACCEPTS identity for message 2 -> MUST NOT produce 409 Resource conflict!
    const accept2 = await api
      .patch(`/api/v1/identity-requests/${req2.body.data._id}/respond`)
      .set('Authorization', `Bearer ${senderToken}`)
      .send({ action: 'accept' });

    expect(accept2.status).toBe(200);
    expect(accept2.body.data.status).toBe('accepted');
    const convId2 = String(accept2.body.data.conversation._id || accept2.body.data.conversation);

    // Both messages link to the same direct conversation between sender and receiver
    expect(convId2).toBe(convId1);
  });
});
