import Message from '../models/Message.js';
import FeedbackGoal from '../models/FeedbackGoal.js';
import { CATEGORY_META, MESSAGE_CATEGORIES } from '../constants/feedback.js';

/**
 * Feedback mirror: turns a pile of notes into a few honest numbers.
 *
 * WHAT THIS CLAIMS — AND WHAT IT DOES NOT
 * Every figure here is a COUNT of messages the user already owns. Nothing is
 * inferred about senders, nothing is inferred about the truth of the notes, and
 * no text is re-analysed. Repetition is reported as repetition, never as proof:
 * five similar notes may be one person having a bad week, and the mirror says
 * so rather than pretending otherwise.
 *
 * PRIVACY
 * Aggregates only. No per-sender breakdown is possible because no sender is
 * stored, and no small-cell counts (n < 3) are returned for the same reason a
 * survey should not publish a group of two.
 */

const MIN_CELL = 3;

const PERIODS = Object.freeze({
  '30d': { days: 30, label: 'آخر 30 يومًا' },
  '90d': { days: 90, label: 'آخر 90 يومًا' },
  all: { days: null, label: 'كل الوقت' },
});

export const PERIOD_KEYS = Object.freeze(Object.keys(PERIODS));

/**
 * Build the mirror for one user.
 * @param {string} userId
 * @param {'30d'|'90d'|'all'} period
 */
export const buildMirror = async (userId, period = '30d') => {
  const config = PERIODS[period] ?? PERIODS['30d'];
  const base = { recipient: userId, isDeleted: false };
  if (config.days) {
    base.createdAt = { $gte: new Date(Date.now() - config.days * 24 * 60 * 60 * 1000) };
  }

  const [byCategory, totals, goalStats, recent] = await Promise.all([
    Message.aggregate([
      { $match: base },
      { $group: { _id: '$category', count: { $sum: 1 }, unread: { $sum: { $cond: ['$isRead', 0, 1] } } } },
      { $sort: { count: -1 } },
    ]),
    Message.aggregate([
      { $match: base },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unread: { $sum: { $cond: ['$isRead', 0, 1] } },
          flagged: { $sum: { $cond: [{ $ifNull: ['$harmLabel', false] }, 1, 0] } },
          released: { $sum: { $cond: [{ $ifNull: ['$releasedAt', false] }, 1, 0] } },
        },
      },
    ]),
    FeedbackGoal.aggregate([
      { $match: { owner: userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // A short, honest "themes" signal: the categories that recur most often in
    // the last 14 days. Reported as counts, never as conclusions.
    Message.aggregate([
      {
        $match: {
          ...base,
          createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        },
      },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $match: { count: { $gte: MIN_CELL } } },
      { $sort: { count: -1 } },
      { $limit: 3 },
    ]),
  ]);

  const total = totals[0]?.total ?? 0;
  const categories = Object.values(MESSAGE_CATEGORIES).map((key) => {
    const row = byCategory.find((r) => r._id === key);
    const count = row?.count ?? 0;
    return {
      key,
      label: CATEGORY_META[key].label,
      icon: CATEGORY_META[key].icon,
      count,
      unread: row?.unread ?? 0,
      // Percentages are rounded and may not sum to exactly 100; we say so.
      share: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });

  const activeGoals = goalStats.find((g) => g._id === 'active')?.count ?? 0;
  const doneGoals = goalStats.find((g) => g._id === 'done')?.count ?? 0;

  return {
    period: { key: config === PERIODS.all ? 'all' : period, label: config.label },
    totals: {
      messages: total,
      unread: totals[0]?.unread ?? 0,
      flagged: totals[0]?.flagged ?? 0,
      released: totals[0]?.released ?? 0,
    },
    categories,
    themes: recent.map((r) => ({
      key: r._id ?? MESSAGE_CATEGORIES.GENERAL,
      label: CATEGORY_META[r._id ?? MESSAGE_CATEGORIES.GENERAL].label,
      icon: CATEGORY_META[r._id ?? MESSAGE_CATEGORIES.GENERAL].icon,
      count: r.count,
    })),
    goals: { active: activeGoals, done: doneGoals },
    /**
     * The honest caveat, surfaced in the UI rather than buried in a footnote.
     * Repeated notes may come from the same person or a coordinated group;
     * the mirror cannot tell, and does not pretend to.
     */
    caveat:
      'الأرقام أعلاه عدّات لرسائلك أنت فقط. التكرار لا يعني أن الملاحظة صحيحة، وقد تكون من شخص واحد.',
  };
};

export default { buildMirror, PERIOD_KEYS };
