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
