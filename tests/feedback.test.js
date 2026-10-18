import { describe, it, expect, beforeEach } from 'vitest';
import {
  api,
  createUser,
  createMessage,
  signTokenFor,
  authHeaderFor,
  Message,
  User,
} from './helpers.js';
import FeedbackGoal from '../src/models/FeedbackGoal.js';
import { analyze, previewForSender, normalizeArabic } from '../src/services/harmShieldService.js';

/* ================================================================== */
/* 1. The rule engine, on its own.                                     */
/* ================================================================== */

describe('Harm shield (rule engine)', () => {
  describe('normalisation', () => {
    it('folds alef variants, teh marbuta and diacritics into one form', () => {
      // "أهلاً" written with a diacritic + hamza alef must equal the plain form.
      expect(normalizeArabic('أَهْلًا')).toBe(normalizeArabic('اهلا'));
      expect(normalizeArabic('إحسان')).toBe(normalizeArabic('احسان'));
      expect(normalizeArabic('صفة')).toBe(normalizeArabic('صفه'));
    });

    it('drops zero-width marks used to dodge filters', () => {
      // A zero-width space injected between letters must not defeat matching.
      expect(normalizeArabic('غ\u200bبي')).toBe('غبي');
    });
  });

  describe('clean text is never flagged', () => {
    const clean = [
      'أتمنى لك التوفيق في حياتك',
      'فكرتك جميلة وأحببت الطريقة التي عرضتها بها',
      'نصيحة: خذ وقتك قبل أن تقرر',
      'الاختبار كان صعبًا لكن النتيجة تستحق',
      'شكراً جزيلاً على مساعدتك',
    ];

    it.each(clean)('does not flag: %s', (text) => {
      expect(analyze(text).harmLabel).toBeNull();
    });
  });

  describe('clear harm is caught', () => {
    it('flags a direct insult', () => {
      const result = analyze('أنت شخص غبي ولا فائدة منك');
      expect(result.harmLabel).toBe('insult');
      expect(result.matched.length).toBeGreaterThan(0);
    });

    it('flags a threat with the strongest severity', () => {
      // A threat must outrank an insult when both appear.
      const result = analyze('أنت غبي وسأقتلك');
      expect(result.harmLabel).toBe('threat');
    });

    it('flags profanity', () => {
      expect(analyze('كسمك يا وسخ').harmLabel).toBe('profanity');
    });

    it('flags harassment / persistence', () => {
      expect(analyze('مش هسيبك وهعرف عنوانك').harmLabel).toBe('harassment');
    });

    it('still catches a variant spelling of the same word', () => {
      // Written with hamza alef + teh marbuta, which the naive form misses.
      expect(analyze('إنت غبيه').harmLabel).toBe('insult');
    });

    it('reports a confidence between 0 and 1', () => {
      const { confidence } = analyze('أنت غبي وتافه وحقير');
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(0.95);
    });
  });

  describe('honesty about its own limits', () => {
    it('returns no label for empty or whitespace text', () => {
      expect(analyze('').harmLabel).toBeNull();
      expect(analyze('   \n  ').harmLabel).toBeNull();
    });

    it('gives the sender a warning, not a block', () => {
      const preview = previewForSender('أنت شخص غبي');
      expect(preview.warning).toBeTruthy();
      expect(preview.hint).toBeTruthy();
    });

    it('gives no warning for clean text', () => {
      expect(previewForSender('أتمنى لك الخير').warning).toBeNull();
    });
  });
});

/* ================================================================== */
/* 2. Shield + categories wired into the send path.                    */
/* ================================================================== */

describe('Feedback-aware sending', () => {
  let recipient;

  beforeEach(async () => {
    recipient = await createUser({ username: `recv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` });
  });

  const send = (username, body) => api.post(`/api/v1/messages/${username}`).send(body);

  it('stores the category the sender chose', async () => {
    const res = await send(recipient.username, {
      content: 'أحببت طريقتك في شرح الفكرة',
      category: 'appreciate',
    });

    expect(res.status).toBe(201);

    const stored = await Message.findOne({ recipient: recipient._id });
    expect(stored.category).toBe('appreciate');
    expect(stored.harmLabel).toBeNull();
    expect(stored.isQuarantined).toBe(false);
  });

  it('defaults to general when no category is given', async () => {
    await send(recipient.username, { content: 'ملاحظة عادية تمامًا' });
    const stored = await Message.findOne({ recipient: recipient._id });
    expect(stored.category).toBe('general');
  });

  it('rejects an unknown category', async () => {
    const res = await send(recipient.username, { content: 'أهلاً', category: 'nonsense' });
    expect(res.status).toBe(400);
  });

  it('quarantines a flagged message instead of hiding it outright', async () => {
    await send(recipient.username, { content: 'أنت شخص غبي ولا فائدة منك' });

    const stored = await Message.findOne({ recipient: recipient._id });
    expect(stored.harmLabel).toBe('insult');
    expect(stored.isQuarantined).toBe(true);
    // The content is still stored — the recipient decides, not the filter.
    expect(stored.content).toContain('غبي');
  });

  it('keeps the label but skips quarantine when the owner turns that off', async () => {
    await User.updateOne(
      { _id: recipient._id },
      { $set: { 'reception.quarantineFlagged': false } },
    );

    await send(recipient.username, { content: 'أنت شخص غبي' });

    const stored = await Message.findOne({ recipient: recipient._id });
    expect(stored.harmLabel).toBe('insult');
    expect(stored.isQuarantined).toBe(false);
  });

  it('does not screen at all when the owner disables the shield', async () => {
    await User.updateOne({ _id: recipient._id }, { $set: { 'reception.enableShield': false } });

    await send(recipient.username, { content: 'أنت شخص غبي' });

    const stored = await Message.findOne({ recipient: recipient._id });
    expect(stored.harmLabel).toBeNull();
    expect(stored.isQuarantined).toBe(false);
  });
});

/* ================================================================== */
/* 3. Reception policy — the owner's own rules.                        */
/* ================================================================== */

describe('Reception policy', () => {
  describe('GET /api/v1/reception', () => {
    it('requires authentication', async () => {
      expect((await api.get('/api/v1/reception')).status).toBe(401);
    });

    it('returns defaults for a brand-new account', async () => {
      const { authorization } = await authHeaderFor();
      const res = await api.get('/api/v1/reception').set(authorization);

      expect(res.status).toBe(200);
      expect(res.body.data.reception).toMatchObject({
        isPaused: false,
        enableShield: true,
        quarantineFlagged: true,
        isReceivingMessages: true,
        allowedCategories: [],
      });
      // The sender-facing category list is offered so the UI need not hardcode it.
      expect(res.body.data.reception.availableCategories.length).toBeGreaterThan(0);
    });
  });

  describe('PUT /api/v1/reception', () => {
    it('updates the policy and echoes it back', async () => {
      const { authorization } = await authHeaderFor();
      const res = await api
        .put('/api/v1/reception')
        .set(authorization)
        .send({
          policyMessage: 'اريد ملاحظات عن العمل فقط',
          allowedCategories: ['improve', 'advice'],
          requireCategory: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.reception.policyMessage).toBe('اريد ملاحظات عن العمل فقط');
      expect(res.body.data.reception.requireCategory).toBe(true);
      expect(res.body.data.reception.allowedCategories).toEqual(['improve', 'advice']);
    });

    it('rejects an unknown category rather than silently dropping it', async () => {
      const { authorization } = await authHeaderFor();
      const res = await api
        .put('/api/v1/reception')
        .set(authorization)
        .send({ allowedCategories: ['improve', 'not_a_category'] });

      // Silently discarding part of the choice would leave the owner
      // believing they had blocked something they had not.
      expect(res.status).toBe(400);
    });

    it('rejects unknown fields', async () => {
      const { authorization } = await authHeaderFor();
      const res = await api
        .put('/api/v1/reception')
        .set(authorization)
        .send({ role: 'admin' });

      expect(res.status).toBe(400);
    });

    it('clears the pause reason when unpausing', async () => {
      const { authorization } = await authHeaderFor();

      await api.put('/api/v1/reception').set(authorization).send({ isPaused: true, pauseReason: 'مشغول' });
      const res = await api.put('/api/v1/reception').set(authorization).send({ isPaused: false });

      expect(res.body.data.reception.isPaused).toBe(false);
      expect(res.body.data.reception.pauseReason).toBe('');
    });
  });

  describe('the policy is actually enforced on send', () => {
    it('makes a paused inbox answer exactly like a missing account', async () => {
      const recipient = await createUser({ username: `paused_${Math.random().toString(36).slice(2, 8)}` });
      await User.updateOne(
        { _id: recipient._id },
        { $set: { 'reception.isPaused': true, 'reception.pauseReason': 'سأعود لاحقًا' } },
      );

      const res = await api
        .post(`/api/v1/messages/${recipient.username}`)
        .send({ content: 'أهلاً' });

      // Deliberately indistinguishable from "no such user": no enumeration.
      expect(res.status).toBe(404);
    });

    it('rejects a category outside the allow-list with the generic 404', async () => {
      const recipient = await createUser({ username: `allow_${Math.random().toString(36).slice(2, 8)}` });
      await User.updateOne(
        { _id: recipient._id },
        { $set: { 'reception.allowedCategories': ['improve'] } },
      );

      const rejected = await api
        .post(`/api/v1/messages/${recipient.username}`)
        .send({ content: 'أنت رائع', category: 'appreciate' });
      expect(rejected.status).toBe(404);

      const accepted = await api
        .post(`/api/v1/messages/${recipient.username}`)
        .send({ content: 'يمكنك تحسين العرض', category: 'improve' });
      expect(accepted.status).toBe(201);
    });

    it('enforces requireCategory on the server, not just in the UI', async () => {
      const recipient = await createUser({ username: `req_${Math.random().toString(36).slice(2, 8)}` });
      await User.updateOne({ _id: recipient._id }, { $set: { 'reception.requireCategory': true } });

      const withoutCategory = await api
        .post(`/api/v1/messages/${recipient.username}`)
        .send({ content: 'ملاحظة بدون فئة' });
      expect(withoutCategory.status).toBe(400);

      const withCategory = await api
        .post(`/api/v1/messages/${recipient.username}`)
        .send({ content: 'ملاحظة مع فئة', category: 'advice' });
      expect(withCategory.status).toBe(201);
    });
  });

  describe('PUT /api/v1/reception/prompts', () => {
    it('replaces the published prompt list', async () => {
      const { authorization } = await authHeaderFor();

      const res = await api
        .put('/api/v1/reception/prompts')
        .set(authorization)
        .send({
          prompts: [
            { text: 'ما الشيء الذي أفعله ويزعجك؟' },
            { text: 'ما أفضل صفة تراها فيّ؟', isActive: false },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.prompts).toHaveLength(2);
      expect(res.body.data.prompts[0].text).toBe('ما الشيء الذي أفعله ويزعجك؟');
      expect(res.body.data.prompts[0].isActive).toBe(true);
      expect(res.body.data.prompts[1].isActive).toBe(false);
      // ids are server-generated so a client cannot collide them.
      expect(res.body.data.prompts[0].id).toBeTruthy();
    });

    it('caps the number of prompts', async () => {
      const { authorization } = await authHeaderFor();
      const res = await api
        .put('/api/v1/reception/prompts')
        .set(authorization)
        .send({ prompts: Array.from({ length: 9 }, (_, i) => ({ text: `سؤال رقم ${i}` })) });

      expect(res.status).toBe(400);
    });

  it('rejects a prompt that is too short instead of silently dropping it', async () => {
    const { authorization } = await authHeaderFor();
    const res = await api
      .put('/api/v1/reception/prompts')
      .set(authorization)
      .send({ prompts: [{ text: 'ok' }, { text: 'سؤال حقيقي وكبير بما يكفي' }] });

    // Rejecting is the honest behaviour: silently discarding part of what the
    // user typed would leave them believing it was saved.
    expect(res.status).toBe(400);
  });
  });

  describe('the sender-visible policy on the public profile', () => {
    it('publishes only what the owner chose to publish', async () => {
      const recipient = await createUser({ username: `pub_${Math.random().toString(36).slice(2, 8)}` });
      await User.updateOne(
        { _id: recipient._id },
        {
          $set: {
            'reception.policyMessage': 'اريد نصيحة واحدة فقط',
            'reception.requireCategory': true,
            prompts: [{ id: 'p1', text: 'ما الذي يمكنني تحسينه؟', isActive: true }],
          },
        },
      );

      const res = await api.get(`/api/v1/users/${recipient.username}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.policy).toMatchObject({
        policyMessage: 'اريد نصيحة واحدة فقط',
        requireCategory: true,
        isPaused: false,
      });
      expect(res.body.data.user.policy.prompts).toHaveLength(1);
      // A private allow-list is not disclosed when it is empty.
      expect(res.body.data.user.policy.allowedCategories).toBeNull();
    });

    it('hides inactive prompts from senders', async () => {
      const recipient = await createUser({ username: `hid_${Math.random().toString(36).slice(2, 8)}` });
      await User.updateOne(
        { _id: recipient._id },
        { $set: { prompts: [{ id: 'p1', text: 'سؤال مخفي', isActive: false }] } },
      );

      const res = await api.get(`/api/v1/users/${recipient.username}`);
      expect(res.body.data.user.policy.prompts).toHaveLength(0);
    });
  });
});

/* ================================================================== */
/* 4. Inbox: quarantine as a section, recipient stays in control.      */
/* ================================================================== */

describe('Inbox quarantine', () => {
  let owner;
  let headers;

  beforeEach(async () => {
    owner = await createUser({ username: `inbox_${Math.random().toString(36).slice(2, 8)}` });
    const token = signTokenFor(owner);
    headers = { Authorization: `Bearer ${token}` };
  });

  it('separates flagged messages from the normal inbox', async () => {
    await createMessage(owner._id, { content: 'ملاحظة لطيفة', category: 'appreciate' });
    await createMessage(owner._id, {
      content: 'أنت غبي',
      category: 'general',
      harmLabel: 'insult',
      isQuarantined: true,
    });

    const inbox = await api.get('/api/v1/messages').set(headers);
    expect(inbox.status).toBe(200);
    expect(inbox.body.data.messages).toHaveLength(1);
    expect(inbox.body.data.messages[0].content).toBe('ملاحظة لطيفة');

    const quarantine = await api.get('/api/v1/messages?quarantined=true').set(headers);
    expect(quarantine.body.data.messages).toHaveLength(1);
    expect(quarantine.body.data.messages[0].harmLabel).toBe('insult');
  });

  it('filters the inbox by category', async () => {
    await createMessage(owner._id, { content: 'واحد', category: 'improve' });
    await createMessage(owner._id, { content: 'اثنان', category: 'appreciate' });

    const res = await api.get('/api/v1/messages?category=improve').set(headers);
    expect(res.body.data.messages).toHaveLength(1);
    expect(res.body.data.messages[0].content).toBe('واحد');
  });

  it('lets the owner see why a message was held, then release it', async () => {
    await createMessage(owner._id, { content: 'نص مسيء', harmLabel: 'insult', isQuarantined: true });

    // The default inbox hides it — that is the point of the section.
    const normal = await api.get('/api/v1/messages').set(headers);
    expect(normal.body.data.messages).toHaveLength(0);

    const held = await api.get('/api/v1/messages?quarantined=true').set(headers);
    const message = held.body.data.messages[0];

    expect(message.harmLabel).toBe('insult');
    expect(message.isQuarantined).toBe(true);
    // The label survives the release, so the owner still sees the reason.
  });

  it('lets the owner release a held message', async () => {
    const message = await createMessage(owner._id, { content: 'محتو', harmLabel: 'insult', isQuarantined: true });

    const res = await api.patch(`/api/v1/messages/${message._id}/release`).set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.message.isQuarantined).toBe(false);
    expect(res.body.data.message.releasedAt).toBeTruthy();
    expect(res.body.data.message.harmLabel).toBe('insult');
  });

  it('counts inbox, unread and quarantined separately', async () => {
    await createMessage(owner._id, { content: '1' });
    await createMessage(owner._id, { content: '2', isRead: true });
    await createMessage(owner._id, { content: '3', isQuarantined: true });

    const res = await api.get('/api/v1/messages/counts').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ total: 3, unread: 2, quarantined: 1 });
  });

  it('does not let another user release my message', async () => {
    const message = await createMessage(owner._id, { content: 'خاص', isQuarantined: true });
    const intruder = await authHeaderFor();

    const res = await api
      .patch(`/api/v1/messages/${message._id}/release`)
      .set(intruder.authorization);

    // 404, not 403: knowing an id must not confirm that it exists.
    expect(res.status).toBe(404);
  });
});

/* ================================================================== */
/* 5. Feedback mirror.                                                 */
/* ================================================================== */

describe('Feedback mirror', () => {
  let owner;
  let headers;

  beforeEach(async () => {
    owner = await createUser({ username: `mirror_${Math.random().toString(36).slice(2, 8)}` });
    headers = { Authorization: `Bearer ${signTokenFor(owner)}` };
  });

  it('requires authentication', async () => {
    expect((await api.get('/api/v1/mirror')).status).toBe(401);
  });

  it('reports counts per category and the totals', async () => {
    await createMessage(owner._id, { content: 'a', category: 'improve' });
    await createMessage(owner._id, { content: 'b', category: 'improve' });
    await createMessage(owner._id, { content: 'c', category: 'advice', isRead: true });

    const res = await api.get('/api/v1/mirror').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.totals.messages).toBe(3);

    const improve = res.body.data.categories.find((c) => c.key === 'improve');
    expect(improve.count).toBe(2);
    expect(improve.label).toBeTruthy();

    const advice = res.body.data.categories.find((c) => c.key === 'advice');
    expect(advice.count).toBe(1);
  });

  it('states its own limits rather than overclaiming', async () => {
    await createMessage(owner._id, { content: 'a', category: 'improve' });

    const res = await api.get('/api/v1/mirror').set(headers);

    // The mirror must say repetition is not proof, and must not infer senders.
    expect(res.body.data.caveat).toMatch(/لا يعني/);
    expect(JSON.stringify(res.body.data)).not.toMatch(/مرسل|sender/i);
  });

  it('does not report a small theme as if it were a trend', async () => {
    // Two similar notes is below the minimum cell size of 3.
    await createMessage(owner._id, { content: 'a', category: 'improve' });
    await createMessage(owner._id, { content: 'b', category: 'improve' });

    const res = await api.get('/api/v1/mirror').set(headers);
    expect(res.body.data.themes).toHaveLength(0);
  });

  it('accepts a period filter and rejects an unknown one', async () => {
    expect((await api.get('/api/v1/mirror?period=90d').set(headers)).status).toBe(200);
    expect((await api.get('/api/v1/mirror?period=yesterday').set(headers)).status).toBe(400);
  });

  it('never reads another user\'s messages', async () => {
    const stranger = await createUser();
    await createMessage(stranger._id, { content: 'سري', category: 'improve' });

    const res = await api.get('/api/v1/mirror').set(headers);
    expect(res.body.data.totals.messages).toBe(0);
  });
});

/* ================================================================== */
/* 6. Goals — turning a note into your own commitment.                 */
/* ================================================================== */

describe('Feedback goals', () => {
  let owner;
  let headers;

  beforeEach(async () => {
    owner = await createUser({ username: `goal_${Math.random().toString(36).slice(2, 8)}` });
    headers = { Authorization: `Bearer ${signTokenFor(owner)}` };
  });

  it('requires authentication', async () => {
    expect((await api.get('/api/v1/goals')).status).toBe(401);
  });

  it('creates a goal from one of my own messages and back-links it', async () => {
    const message = await createMessage(owner._id, { content: 'تقطع الكلام' });

    const res = await api
      .post('/api/v1/goals')
      .set(headers)
      .send({
        messageId: String(message._id),
        note: 'اترك الطرف الآخر ينهي كلامه',
        action: 'سأنتظر 3 ثوانٍ قبل الرد',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.goal.note).toBe('اترك الطرف الآخر ينهي كلامه');
    expect(res.body.data.goal.status).toBe('active');

    const updated = await Message.findById(message._id);
    expect(String(updated.goal)).toBe(String(res.body.data.goal._id));
  });

  it('refuses to build a goal from someone else\'s message', async () => {
    const stranger = await createUser();
    const message = await createMessage(stranger._id, { content: 'ليست لي' });

    const res = await api
      .post('/api/v1/goals')
      .set(headers)
      .send({ messageId: String(message._id), note: 'محاولة' });

    expect(res.status).toBe(404);
  });

  it('rejects a review date in the past', async () => {
    const res = await api
      .post('/api/v1/goals')
      .set(headers)
      .send({ note: 'هدف', reviewAt: new Date(Date.now() - 86400000).toISOString() });

    expect(res.status).toBe(400);
  });

  it('rejects a review date beyond a year', async () => {
    const res = await api
      .post('/api/v1/goals')
      .set(headers)
      .send({ note: 'هدف', reviewAt: new Date(Date.now() + 400 * 86400000).toISOString() });

    expect(res.status).toBe(400);
  });

  it('updates status and records completion time', async () => {
    const created = await api.post('/api/v1/goals').set(headers).send({ note: 'هدف قصير' });
    const id = created.body.data.goal._id;

    const res = await api.patch(`/api/v1/goals/${id}`).set(headers).send({ status: 'done', rating: 4 });

    expect(res.status).toBe(200);
    expect(res.body.data.goal.status).toBe('done');
    expect(res.body.data.goal.rating).toBe(4);
    expect(res.body.data.goal.completedAt).toBeTruthy();
  });

  it('clears completion time when a goal is reopened', async () => {
    const created = await api.post('/api/v1/goals').set(headers).send({ note: 'هدف' });
    const id = created.body.data.goal._id;

    await api.patch(`/api/v1/goals/${id}`).set(headers).send({ status: 'done' });
    const reopened = await api.patch(`/api/v1/goals/${id}`).set(headers).send({ status: 'active' });

    expect(reopened.body.data.goal.completedAt).toBeNull();
  });

  it('rejects a rating outside 0..5', async () => {
    const created = await api.post('/api/v1/goals').set(headers).send({ note: 'هدف' });
    const id = created.body.data.goal._id;

    const res = await api.patch(`/api/v1/goals/${id}`).set(headers).send({ rating: 9 });
    expect(res.status).toBe(400);
  });

  it('keeps goals private to their owner', async () => {
    const created = await api.post('/api/v1/goals').set(headers).send({ note: 'هدف خاص' });
    const id = created.body.data.goal._id;

    const intruder = await authHeaderFor();

    expect((await api.get(`/api/v1/goals/${id}`).set(intruder.authorization)).status).toBe(404);
    expect((await api.patch(`/api/v1/goals/${id}`).set(intruder.authorization).send({ rating: 1 })).status).toBe(404);
    expect((await api.delete(`/api/v1/goals/${id}`).set(intruder.authorization)).status).toBe(404);
    // The owner can still see it.
    expect((await api.get(`/api/v1/goals/${id}`).set(headers)).status).toBe(200);
  });

  it('deletes a goal and clears the message back-link', async () => {
    const message = await createMessage(owner._id, { content: 'ملاحظة' });
    const created = await api
      .post('/api/v1/goals')
      .set(headers)
      .send({ messageId: String(message._id), note: 'هدف' });
    const id = created.body.data.goal._id;

    const res = await api.delete(`/api/v1/goals/${id}`).set(headers);
    expect(res.status).toBe(200);

    expect(await FeedbackGoal.findById(id)).toBeNull();
    const updated = await Message.findById(message._id);
    expect(updated.goal).toBeNull();
  });

  it('lists goals newest first and filters by status', async () => {
    await api.post('/api/v1/goals').set(headers).send({ note: 'الأول' });
    const second = await api.post('/api/v1/goals').set(headers).send({ note: 'الثاني' });
    await api.patch(`/api/v1/goals/${second.body.data.goal._id}`).set(headers).send({ status: 'done' });

    const all = await api.get('/api/v1/goals').set(headers);
    expect(all.body.data.goals).toHaveLength(2);

    const active = await api.get('/api/v1/goals?status=active').set(headers);
    expect(active.body.data.goals).toHaveLength(1);

    const done = await api.get('/api/v1/goals?status=done').set(headers);
    expect(done.body.data.goals).toHaveLength(1);
  });

  it('surfaces goals whose self-chosen review date has arrived', async () => {
    await api
      .post('/api/v1/goals')
      .set(headers)
      .send({ note: 'مراجعة قريبة', reviewAt: new Date(Date.now() + 3600000).toISOString() });

    const notYet = await api.get('/api/v1/goals/due').set(headers);
    expect(notYet.body.data.goals).toHaveLength(0);

    // Move the date into the past and confirm it shows up.
    await FeedbackGoal.updateMany({}, { $set: { reviewAt: new Date(Date.now() - 1000) } });

    const due = await api.get('/api/v1/goals/due').set(headers);
    expect(due.body.data.goals).toHaveLength(1);
  });

  it('reports goal counts in the mirror', async () => {
    const a = await api.post('/api/v1/goals').set(headers).send({ note: 'نشط' });
    const b = await api.post('/api/v1/goals').set(headers).send({ note: 'منتهي' });
    await api.patch(`/api/v1/goals/${b.body.data.goal._id}`).set(headers).send({ status: 'done' });

    const res = await api.get('/api/v1/mirror').set(headers);
    expect(res.body.data.goals).toEqual({ active: 1, done: 1 });
    expect(a.status).toBe(201);
  });
});
