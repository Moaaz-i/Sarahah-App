/**
 * Presentation constants for the "useful honesty" layer.
 *
 * These mirror `src/constants/feedback.js`. They are duplicated rather than
 * imported because the client is a separate build with no access to the server
 * source tree, and because the server already sends the authoritative labels
 * on the public profile — this file is only the fallback used to render a
 * picker before that response arrives, and for the owner's own screens.
 */

export const CATEGORIES = [
  { key: 'improve', label: 'شيء يمكنني تحسينه', icon: '🛠️', hint: 'اذكر سلوكًا محددًا وطريقة واحدة لتحسينه.' },
  { key: 'appreciate', label: 'شيء تقدّره فيّ', icon: '✨', hint: 'ما الشيء الذي تراه جيدًا ويستحق أن يستمر؟' },
  { key: 'advice', label: 'نصيحة صريحة', icon: '🧭', hint: 'نصيحة واحدة قابلة للتنفيذ، لا قائمة طويلة.' },
  { key: 'impression', label: 'انطباعك الأول عني', icon: '👀', hint: 'صف الانطباع كما بدا لك وقتها، دون أحكام دائمة.' },
  { key: 'general', label: 'ملاحظة عامة', icon: '💬', hint: 'اكتب بصدق، مع تحديد السلوك لا الأشخاص.' },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

/** Labels for the shield's output. Probabilities, never verdicts. */
export const HARM_LABELS = {
  insult: { label: 'لغة تجاه الشخص', icon: '⚠️' },
  threat: { label: 'تهديد محتمل', icon: '🚨' },
  harassment: { label: 'استمرار بعد التوقف', icon: '🛑' },
  profanity: { label: 'كلمات بذيئة', icon: '🗯️' },
};

export const harmMeta = (label) => (label ? HARM_LABELS[label] : null);

export const categoryOf = (key) => CATEGORY_MAP[key] ?? CATEGORY_MAP.general;

export const PERIODS = [
  { key: '30d', label: 'آخر 30 يومًا' },
  { key: '90d', label: 'آخر 90 يومًا' },
  { key: 'all', label: 'كل الوقت' },
];

export const GOAL_STATUSES = [
  { key: 'active', label: 'قيد التنفيذ', icon: '🎯' },
  { key: 'done', label: 'أنهيتها', icon: '✅' },
  { key: 'dropped', label: 'تركتها', icon: '🏳️' },
];

export const goalStatusOf = (key) => GOAL_STATUSES.find((s) => s.key === key) ?? GOAL_STATUSES[0];

/** The four built-in prompts a new account can start from. */
export const STARTER_PROMPTS = [
  'ما الشيء الذي أفعله ويزعجك؟',
  'ما أفضل صفة تراها فيّ؟',
  'ما الذي يمكنني تحسينه؟',
  'ما الانطباع الأول الذي أخذته عني؟',
];

/** Identity clues declaring relation without revealing identity */
export const IDENTITY_CLUES = [
  { key: 'none', label: 'مجهول تمامًا', icon: '🎭', color: '#94a3b8' },
  { key: 'friend', label: 'صديق مقرب', icon: '🤝', color: '#38bdf8' },
  { key: 'colleague', label: 'زميل عمل / دراسة', icon: '💼', color: '#a855f7' },
  { key: 'follower', label: 'متابع', icon: '📱', color: '#34d399' },
  { key: 'secret_admirer', label: 'معجب سري', icon: '💌', color: '#f43f5e' },
  { key: 'family', label: 'من العائلة / الأقارب', icon: '🏡', color: '#fb923c' },
];

export const IDENTITY_CLUE_MAP = Object.fromEntries(IDENTITY_CLUES.map((c) => [c.key, c]));
export const identityClueOf = (key) => IDENTITY_CLUE_MAP[key] ?? IDENTITY_CLUE_MAP.none;

/** Sentiment metadata */
export const SENTIMENTS = [
  { key: 'positive', label: 'إيجابية وتقدير', icon: '💖', color: '#10b981' },
  { key: 'constructive', label: 'نصح وتطوير', icon: '💡', color: '#38bdf8' },
  { key: 'question', label: 'سؤال واستفسار', icon: '❓', color: '#a855f7' },
  { key: 'neutral', label: 'ملاحظة عامة', icon: '💬', color: '#94a3b8' },
  { key: 'negative', label: 'تنبيه سلوك', icon: '⚠️', color: '#f59e0b' },
];

export const SENTIMENT_MAP = Object.fromEntries(SENTIMENTS.map((s) => [s.key, s]));
export const sentimentOf = (key) => SENTIMENT_MAP[key] ?? SENTIMENT_MAP.neutral;

