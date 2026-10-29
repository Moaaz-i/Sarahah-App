/**
 * Free-text hardening.
 *
 * WHY THIS EXISTS
 * Every field a user types into (name, bio, policy message, prompts) ends up
 * rendered on a public profile page. React escapes text by default, so this is
 * NOT the only line of defence — but defence in depth means never relying on a
 * single layer. If a future change renders any of this through `innerHTML`, a
 * template literal, an `href`/`src` attribute or a Markdown pass, these fields
 * are already clean.
 *
 * WHAT IT REMOVES
 * - C0/C1 control characters. Nothing printable needs them; they are used to
 *   smuggle content past naive filters and to corrupt terminal/log output.
 * - Zero-width and bidi-override characters. These are the classic way to make
 *   two different strings look identical, or to hide text inside what appears
 *   to be innocent text.
 * - Angle brackets. Stripping `<` and `>` removes any chance of markup being
 *   interpreted as markup, whatever the rendering path turns out to be.
 * - NUL, which truncates C-string style processing downstream.
 *
 * WHAT IT PRESERVES
 * Newlines and tabs in multi-line fields, Arabic text exactly as typed (aside
 * from the invisible characters above), and leading/trailing whitespace is
 * trimmed rather than the interior being mangled.
 */

/** C0 controls, DEL, and C1 controls. \n (0A) and \t (09) are kept. */
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

/** Zero-width, bidi overrides, BOM, and the word-joiner used to glue words. */
const INVISIBLE_CHARS = /[\u200b-\u200f\u202a-\u202e\u2060\u2061-\u2064\ufeff]/g;

/** Markup delimiters. Kept as a separate pass so the intent is legible. */
const ANGLE_BRACKETS = /[<>]/g;

/** Collapse runs of whitespace, then trim the ends. */
const collapseWhitespace = (text) => text.replace(/[ \t]{2,}/g, ' ').trim();

/**
 * Normalise a free-text field.
 *
 * @param {unknown} value  raw input
 * @param {{ stripAngles?: boolean }} [options]
 *   `stripAngles: false` is available for fields where a literal `<`/`>` is
 *   legitimate; it defaults to true because none of the current fields need it.
 * @returns {string} clean text, never `undefined`/`null`
 */
export const sanitizeText = (value, { stripAngles = true } = {}) => {
  if (value === null || value === undefined) return '';

  let text = String(value)
    .replace(CONTROL_CHARS, '')
    .replace(INVISIBLE_CHARS, '');

  if (stripAngles) text = text.replace(ANGLE_BRACKETS, '');

  return collapseWhitespace(text);
};

/**
 * Preserve newlines for multi-line fields (bio, policy message, reflection),
 * collapsing only *runs* of blank lines so a pasted wall of text stays readable
 * without anyone being able to pad a field with hundreds of empty lines.
 */
export const sanitizeMultiline = (value) => {
  const text = sanitizeText(value);

  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * Strip everything that is not a letter, digit, space or a small punctuation
 * set. Used where formatting carries no meaning at all (display names), which
 * removes an entire class of homoglyph and RTL-override tricks.
 */
export const sanitizeDisplayName = (value) => {
  const text = sanitizeText(value);
  // Keep Arabic and Latin letters, digits, and common name punctuation.
  return text.replace(/[^\p{L}\p{N}\s.'’_-]/gu, '').replace(/\s{2,}/g, ' ').trim();
};

export default sanitizeText;
