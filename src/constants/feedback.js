/**
 * The "useful honesty" building blocks shared by models, services and routes.
 * Everything here is data (no secrets); it only holds stable identifiers and
 * user-facing Arabic labels.
 */

/**
 * Message categories. A category is the SENDER's declared intent, not a
 * judgement about the recipient. `general` is the fallback so an unlabelled
 * message is never rejected.
 */
export const MESSAGE_CATEGORIES = Object.freeze({
  IMPROVE: 'improve',
  APPRECIATE: 'appreciate',
  ADVICE: 'advice',
  IMPRESSION: 'impression',
  GENERAL: 'general',
});

export const MESSAGE_CATEGORY_VALUES = Object.freeze(Object.values(MESSAGE_CATEGORIES));

/** Arabic labels + the guidance shown to the sender for each category. */
export const CATEGORY_META = Object.freeze({
  [MESSAGE_CATEGORIES.IMPROVE]: {
    label: 'شيء يمكنني تحسينه',
    icon: '🛠️',
    hint: 'اذكر سلوكًا محددًا وطريقة واحدة لتحسينه.',
  },
  [MESSAGE_CATEGORIES.APPRECIATE]: {
    label: 'شيء تقدّره فيّ',
    icon: '✨',
    hint: 'ما الشيء الذي تراه جيدًا ويستحق أن يستمر؟',
  },
  [MESSAGE_CATEGORIES.ADVICE]: {
    label: 'نصيحة صريحة',
    icon: '🧭',
    hint: 'نصيحة واحدة قابلة للتنفيذ، لا قائمة طويلة.',
  },
  [MESSAGE_CATEGORIES.IMPRESSION]: {
    label: 'انطباعك الأول عني',
    icon: '👀',
    hint: 'صف الانطباع كما بدا لك وقتها، دون أحكام دائمة.',
  },
  [MESSAGE_CATEGORIES.GENERAL]: {
    label: 'ملاحظة عامة',
    icon: '💬',
    hint: 'اكتب بصدق، مع تحديد السلوك لا الأشخاص.',
  },
});

/**
 * Harm labels produced by the rule-based shield.
 * These are PROBABILITIES, not verdicts: the shield reports what it matched,
 * and the recipient can always override it.
 */
export const HARM_LABELS = Object.freeze({
  NONE: null,
  INSULT: 'insult',
  THREAT: 'threat',
  HARASSMENT: 'harassment',
  PROFANITY: 'profanity',
});

export const HARM_LABEL_VALUES = Object.freeze(
  Object.values(HARM_LABELS).filter((v) => v !== null),
);

/** Arabic explanation shown on a quarantined message. */
export const HARM_META = Object.freeze({
  [HARM_LABELS.INSULT]: { label: 'لغة تجاه الشخص', icon: '⚠️' },
  [HARM_LABELS.THREAT]: { label: 'تهديد محتمل', icon: '🚨' },
  [HARM_LABELS.HARASSMENT]: { label: 'استمرار بعد التوقف', icon: '🛑' },
  [HARM_LABELS.PROFANITY]: { label: 'كلمات بذيئة', icon: '🗯️' },
});

/** Goal lifecycle. A goal is created by the RECIPIENT from their own message. */
export const GOAL_STATUSES = Object.freeze({
  ACTIVE: 'active',
  DONE: 'done',
  DROPPED: 'dropped',
});

export const GOAL_STATUS_VALUES = Object.freeze(Object.values(GOAL_STATUSES));

/**
 * Identity Clues: Optional self-declared relationship tag from the sender
 * giving context without revealing identity.
 */
export const IDENTITY_CLUES = Object.freeze({
  NONE: 'none',
  FRIEND: 'friend',
  COLLEAGUE: 'colleague',
  FOLLOWER: 'follower',
  SECRET_ADMIRER: 'secret_admirer',
  FAMILY: 'family',
});

export const IDENTITY_CLUE_VALUES = Object.freeze(Object.values(IDENTITY_CLUES));

export const IDENTITY_CLUE_META = Object.freeze({
  [IDENTITY_CLUES.NONE]: { label: 'مجهول تمامًا', icon: '🎭', color: '#94a3b8' },
  [IDENTITY_CLUES.FRIEND]: { label: 'صديق مقرب', icon: '🤝', color: '#38bdf8' },
  [IDENTITY_CLUES.COLLEAGUE]: { label: 'زميل عمل / دراسة', icon: '💼', color: '#a855f7' },
  [IDENTITY_CLUES.FOLLOWER]: { label: 'متابع', icon: '📱', color: '#34d399' },
  [IDENTITY_CLUES.SECRET_ADMIRER]: { label: 'معجب سري', icon: '💌', color: '#f43f5e' },
  [IDENTITY_CLUES.FAMILY]: { label: 'من العائلة / الأقارب', icon: '🏡', color: '#fb923c' },
});

/**
 * Message sentiment types identified automatically by analysis.
 */
export const SENTIMENTS = Object.freeze({
  POSITIVE: 'positive',
  CONSTRUCTIVE: 'constructive',
  QUESTION: 'question',
  NEUTRAL: 'neutral',
  NEGATIVE: 'negative',
});

export const SENTIMENT_VALUES = Object.freeze(Object.values(SENTIMENTS));

export const SENTIMENT_META = Object.freeze({
  [SENTIMENTS.POSITIVE]: { label: 'إيجابية وتقدير', icon: '💖', color: '#10b981' },
  [SENTIMENTS.CONSTRUCTIVE]: { label: 'نصح وتطوير', icon: '💡', color: '#38bdf8' },
  [SENTIMENTS.QUESTION]: { label: 'سؤال واستفسار', icon: '❓', color: '#a855f7' },
  [SENTIMENTS.NEUTRAL]: { label: 'ملاحظة عامة', icon: '💬', color: '#94a3b8' },
  [SENTIMENTS.NEGATIVE]: { label: 'تنبيه سلوك', icon: '⚠️', color: '#f59e0b' },
});

export default {
  MESSAGE_CATEGORIES,
  MESSAGE_CATEGORY_VALUES,
  CATEGORY_META,
  HARM_LABELS,
  HARM_LABEL_VALUES,
  HARM_META,
  GOAL_STATUSES,
  GOAL_STATUS_VALUES,
  IDENTITY_CLUES,
  IDENTITY_CLUE_VALUES,
  IDENTITY_CLUE_META,
  SENTIMENTS,
  SENTIMENT_VALUES,
  SENTIMENT_META,
};
