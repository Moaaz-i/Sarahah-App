/**
 * Rule-based harm shield for Arabic text.
 *
 * WHY RULES AND NOT A MODEL
 * The product promise is that private messages never leave this server. A
 * keyword/pattern engine keeps that promise: it is deterministic, auditable,
 * cheap, and every flag can be explained to the user by showing what matched.
 *
 * WHAT THIS IS NOT
 * It is not a verdict on intent. It reports evidence ("this matched a threat
 * pattern") and the recipient stays in control: they can read a quarantined
 * message, release it, or turn the shield off entirely. False positives are
 * expected and are the user's to override — never the system's to hide.
 *
 * DESIGN NOTES
 * - Normalisation strips diacritics, tatweel and Arabic-alphabet variants so
 *   "أ", "إ", "آ" and "ا" are one letter, and "ة"/"ه" and "ى"/"ي" collapse.
 *   Without this a single word in another spelling slips straight through.
 * - Patterns are normalised with the SAME function at compile time, so a
 *   pattern never drifts out of sync with the text it is meant to match.
 * - Matching runs on word-ish boundaries so "كلمة" does not match inside a
 *   longer innocent word.
 * - Patterns are ordered by severity; the strongest match wins the label.
 */

/** Zero-width and directional marks that people insert to dodge filters. */
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\ufeff]/g;

/** Arabic diacritics + tatweel (kashida). */
const DIACTRICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g;

/** Alef variants -> plain alef; hamza-final forms -> their base letter. */
const ALEF = /[\u0623\u0625\u0671\u0672\u0673\u0675]/g;
const TEH_MARBUTA = /\u0629/g; // ة -> ه
const ALEF_MAKSURA = /\u0649/g; // ى -> ه
const HAMZA = /[\u0624\u0626]/g; // ؤ ئ -> ء

const ARABIC_LETTERS = '\u0621-\u064a';

/**
 * Normalise for matching while keeping a safe word separator.
 * The ORIGINAL text is never modified; this copy is used for pattern matching
 * only, so the message the user reads is exactly what was typed.
 */
export const normalizeArabic = (text = '') =>
  String(text)
    .replace(INVISIBLE, '')
    .replace(DIACTRICS, '')
    .replace(ALEF, '\u0627')
    .replace(TEH_MARBUTA, '\u0647')
    .replace(ALEF_MAKSURA, '\u0647')
    .replace(HAMZA, '\u0621')
    .toLowerCase();

/**
 * Build a word-boundary pattern from a literal phrase.
 * We cannot use \b because \b is defined on ASCII word characters and does
 * not fire between an Arabic letter and a space reliably; instead we require
 * a non-letter (or string edge) on both sides.
 *
 * ARABIC PREFIXES: conjunctions and prepositions (و ف ب ل ك س) attach directly
 * to the following word with no space, so "وسأقتلك" contains "سقتلك" but never
 * matches a naive boundary. We allow exactly one such light prefix, itself
 * preceded by a real boundary, which catches the common case without matching
 * inside a longer innocent word.
 */
const LIGHT_PREFIX = '(?:\u0648|\u0641|\u0628|\u0644|\u0643|\u0633)?';

const word = (phrase) =>
  new RegExp(
    `(^|[^${ARABIC_LETTERS}])${LIGHT_PREFIX}${normalizeArabic(phrase)}($|[^${ARABIC_LETTERS}])`,
    'g',
  );

/**
 * Phrases are written as people actually type them (with hamza, feminine
 * forms, object suffixes). Normalisation happens at compile time, so both
 * "سأقتلك" and "ساقتلك" end up as one pattern.
 *
 * Both masculine and feminine forms are listed where the word is gendered —
 * Arabic suffixes change the spelling, and a shield that only knows one form
 * is trivially avoided.
 */
const PATTERNS = {
  threat: [
    'سأقتلك',
    'سوف أقتلك',
    'هقتلك',
    'لأقتلك',
    'بأقتلك',
    'أقطعك',
    'سأذيك',
    'سوف آذيك',
    'بأذيك',
    'أذيك',
    'سأضررك',
    'بضررك',
    'حرقك',
    'أنهي حياتك',
    'سأنهي حياتك',
    'أوقع بك',
    'ستندم',
    'بتندم',
    'هتندم',
    'لك الموت',
    'أكسر رأسك',
    'بشوت رأسك',
    'أخليك تندم',
  ],
  harassment: [
    'مش هسيبك',
    'مش هسيبك أبدًا',
    'هعرف مكانك',
    'عرفت عنوانك',
    'هعرف عنوانك',
    'صورتك معايا',
    'هلاحقك',
    'هتابعك',
    'مش هنسيك',
    'مش هنساك',
    'أوعى تفتكر',
    'مش هرحمك',
    'هخليك تندم',
  ],
  insult: [
    'غبي',
    'غبية',
    'غباوة',
    'أناني',
    'أنانية',
    'متكبر',
    'متكبرة',
    'مغرور',
    'مغرورة',
    'واطي',
    'واطية',
    'تافه',
    'تافهة',
    'حقير',
    'حقيرة',
    'زبالة',
    'خايس',
    'خايسة',
    'قذر',
    'قذرة',
    'مش هام',
    'مش مهمة',
    'محدش مهتم',
    'مبيحبكش',
    'مش محتاجينك',
    'كرهك',
    'ابعد عنا',
    'مكانك مش هنا',
    'أنت مسخرة',
    'إنك مسخرة',
    'محتاج تتعالج',
    'أنت مريض',
    'خليك في حالك',
    'مش ناقصنا',
    'فضلت خالص',
    'أفضل تخرس',
    'اخرس',
    'قلة أدب',
    'شكلك وحش',
    'شكلك وحشة',
  ],
  profanity: [
    'كسك',
    'كسمك',
    'خول',
    'منيوكة',
    'طيز',
    'زبي',
    'عرص',
    'بتاعتك',
    'xnigger',
    'stupid',
    'idiot',
    'shut up',
    'fuck you',
    'bitch',
  ],
};

/**
 * Which pattern wins when several match. A threat always outranks an insult,
 * because the recipient's first decision is "is this dangerous", not "is this
 * rude".
 */
const SEVERITY = [
  { label: 'threat', patterns: PATTERNS.threat },
  { label: 'harassment', patterns: PATTERNS.harassment },
  { label: 'insult', patterns: PATTERNS.insult },
  { label: 'profanity', patterns: PATTERNS.profanity },
];

const COMPILED = SEVERITY.map((tier) => ({
  label: tier.label,
  // Keep the normalised phrase alongside its regex so a match can be reported
  // back to the user as readable text rather than regex source.
  items: tier.patterns.map((phrase) => ({
    phrase: normalizeArabic(phrase),
    regex: word(phrase),
  })),
}));

/** Number of whitespace-separated tokens that contain an Arabic letter. */
const meaningfulWordCount = (text) =>
  text.split(/\s+/).filter((w) => new RegExp(`[${ARABIC_LETTERS}]`).test(w)).length;

const scan = (text) => {
  const matched = [];
  let label = null;

  for (const tier of COMPILED) {
    const hits = [];
    for (const { phrase, regex } of tier.items) {
      regex.lastIndex = 0;
      if (regex.test(text)) hits.push(phrase);
    }
    if (hits.length === 0) continue;
    // The strongest tier that fired becomes the label; weaker ones still
    // contribute evidence to the confidence score.
    if (label === null) label = tier.label;
    matched.push(...hits);
  }

  if (!label) return { harmLabel: null, matched: [], confidence: 0 };

  // Confidence: more distinct matches on a longer message reads as deliberate
  // rather than an accident. Capped so one stray keyword never looks certain.
  const words = meaningfulWordCount(text);
  const density = Math.min(1, matched.length / 3);
  const length = Math.min(1, words / 8);
  const confidence = Math.min(0.95, 0.45 + density * 0.35 + length * 0.15);

  return { harmLabel: label, matched, confidence: Number(confidence.toFixed(2)) };
};

const POSITIVE_PATTERNS = [
  'شكرا', 'اشكرك', 'مبدع', 'مميز', 'فخور', 'رائع', 'جميل', 'عظيم', 'احبك', 'بحبك',
  'افضل', 'طيب', 'كريم', 'عبقري', 'عاش', 'برافو', 'تسلم', 'الله يوفقك', 'الله يسعدك',
  'ما شاء الله', 'تبارك الله', 'proud', 'love', 'great', 'awesome', 'best', 'thank', 'amazing',
];

const CONSTRUCTIVE_PATTERNS = [
  'انصحك', 'نصيحه', 'لو تجرب', 'حاول', 'طور', 'تطوير', 'تحسين', 'فكر في',
  'من الافضل', 'ركز على', 'اقترح', 'تعديل', 'ملاحظه', 'advice', 'improve', 'suggest', 'try',
];

const QUESTION_PATTERNS = [
  '?', '؟', 'هل', 'ليه', 'لماذا', 'كيف', 'ازاي', 'شو', 'ايه', 'مين', 'متى', 'فين', 'وين'
];

/**
 * Heuristically classify sentiment of a message.
 */
export const analyzeSentiment = (rawText = '', harmLabel = null) => {
  if (harmLabel) return 'negative';
  const text = normalizeArabic(rawText);

  let hasQuestion = false;
  for (const q of QUESTION_PATTERNS) {
    if (text.includes(q)) {
      hasQuestion = true;
      break;
    }
  }

  let positiveScore = 0;
  for (const p of POSITIVE_PATTERNS) {
    if (text.includes(normalizeArabic(p))) positiveScore += 1;
  }

  let constructiveScore = 0;
  for (const c of CONSTRUCTIVE_PATTERNS) {
    if (text.includes(normalizeArabic(c))) constructiveScore += 1;
  }

  if (positiveScore > 0 && positiveScore >= constructiveScore) return 'positive';
  if (constructiveScore > 0) return 'constructive';
  if (hasQuestion) return 'question';

  return 'neutral';
};

/**
 * Scan a message.
 *
 * @returns {{harmLabel: string|null, matched: string[], confidence: number, sentiment: string}}
 */
export const analyze = (rawText = '') => {
  const text = normalizeArabic(rawText);
  if (!text.trim()) return { harmLabel: null, matched: [], confidence: 0, sentiment: 'neutral' };
  const scanResult = scan(text);
  const sentiment = analyzeSentiment(rawText, scanResult.harmLabel);
  return { ...scanResult, sentiment };
};

/**
 * A preview for the SENDER before they send: same engine, framed as advice
 * ("this may read as an attack — do you want to reword it?"). The sender can
 * still send; the shield never blocks, it only informs.
 */
export const previewForSender = (text = '') => {
  const result = analyze(text);
  if (!result.harmLabel) return { warning: null, hint: null, label: null };
  return {
    warning: 'قد تُقرأ رسالتك على أنها موجّهة للشخص لا للسلوك. هل تريد تعديلها؟',
    hint: 'ركّز على سلوك محدّد يمكن تغييره، وابتعد عن وصف الأشخاص.',
    label: result.harmLabel,
  };
};

export default { analyze, analyzeSentiment, previewForSender, normalizeArabic };
