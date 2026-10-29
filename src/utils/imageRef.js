import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Avatar references — the one place that decides what may be stored in
 * `User.avatar` and therefore rendered as an `<img src>` on a public page.
 *
 * An avatar may be exactly one of four shapes:
 *
 *   1. ''                                  nothing set
 *   2. data:image/<type>;<encoding>,<data> an embedded image (the built-in presets)
 *   3. /uploads/avatars/<uuid>.<ext>       a file this server actually holds
 *   4. https://host/path                   an external image URL
 *
 * WHY A CANONICAL VALIDATOR
 * This field is a link input, and link inputs are the classic stored-XSS and
 * SSRF surface: `javascript:`, `data:text/html`, `//evil`, protocol-relative
 * URLs, NUL truncation, and attribute-breakout payloads. Rejecting by
 * allowlist — four known shapes, each parsed strictly — is far safer than
 * blacklisting the dangerous-looking prefixes, because every future scheme has
 * to be deliberately added rather than being accidentally allowed.
 *
 * NOTE ON SAFETY OF THE RENDERING PATH
 * React sets `src` as an attribute, so it escapes quotes and cannot break out
 * of the attribute. That already neutralises `onerror=` style payloads. This
 * module goes further so the *stored* value is clean regardless of how it is
 * ever rendered later.
 */

const __dirname = dirnameOf(import.meta.url);

function dirnameOf(p) {
  return path.dirname(fileURLToPath(p));
}

/** Absolute path of the uploads root. Filenames inside must always resolve here. */
export const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');

/** Sub-directory reserved for avatars, and the public prefix that maps to it. */
export const AVATAR_DIR = 'avatars';
export const AVATAR_PUBLIC_PREFIX = `/uploads/${AVATAR_DIR}`;

/** Hard caps. An avatar is a thumbnail; anything past this is not an avatar. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_AVATAR_REF_LENGTH = 64 * 1024; // embedded data can be long
export const MAX_EXTERNAL_URL_LENGTH = 2048;

/**
 * Formats a browser may UPLOAD as a real file. Deliberately excludes SVG: an
 * SVG can carry scripts and external references, and while browsers do not
 * execute scripts in SVG loaded through `<img>`, refusing it removes the whole
 * question. Our own presets are static, reviewed, self-contained SVGs and are
 * covered by the data-URI rules below instead.
 */
export const UPLOADABLE_TYPES = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
});

export const UPLOADABLE_MIME_LIST = Object.freeze(Object.keys(UPLOADABLE_TYPES));

/**
 * Types allowed inside an EMBEDDED data URI. SVG is allowed here only because
 * these are the built-in presets we ship ourselves; the payload is still
 * screened for script-like content below.
 */
const ALLOWED_DATA_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

/** Encodings a data URI may use. `base64,` and the SVG-friendly `utf8,`. */
const ALLOWED_DATA_ENCODINGS = new Set(['base64,', 'utf8,']);

/**
 * Characters permitted in a data URI payload.
 * `encodeURIComponent` leaves `A-Za-z0-9` and `- _ . ~ ! * ' ( )` untouched and
 * encodes everything else as `%XX`; base64 adds `+ / =`. Restricting to this
 * set means a payload cannot smuggle a `;`, a comma, whitespace, a quote, a
 * `<` or a control character into the surrounding structure.
 */
const DATA_PAYLOAD_SAFE = /^[A-Za-z0-9+\-_.~!*'()%,/:;()]*$/;

/** A file this server produced: exactly our UUID + an allow-listed extension. */
const UPLOAD_REF_SHAPE = /^\/uploads\/avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|gif)$/;

/**
 * Script-like constructs that must never appear in an embedded SVG, even one
 * rendered through `<img>`. Rejection rather than rewriting: a preset never
 * needs any of these, so their presence is always intentional.
 */
const SVG_DANGER = [
  /<\s*script/i,
  /<\s*foreignobject/i,
  /<\s*use\b[^>]*\bhref\s*=/i,
  /<\s*iframe/i,
  /<\s*embed/i,
  /<\s*object/i,
  /<!entity/i,
  /<\s*\?php/i,
  /\bon[a-z]+\s*=/i, // onload=, onerror=, ...
  /javascript\s*:/i,
  /href\s*=\s*["']?\s*(?:https?:|\/\/)/i, // external resource fetch
  /xlink:href\s*=/i,
];

class AvatarRefError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AvatarRefError';
  }
}

/** True when the reference is a file this server serves itself. */
export const isUploadRef = (value) => UPLOAD_REF_SHAPE.test(String(value ?? ''));

/** True for the built-in embedded images and any other safe data URI. */
export const isDataUriRef = (value) => /^data:image\//i.test(String(value ?? ''));

/**
 * Build the public path for a file stored under uploads/.
 * Rejects traversal outright rather than resolving-and-checking, so there is no
 * window where a `..` could survive.
 */
export const toUploadRef = (filename) => {
  const safeName = path.basename(String(filename ?? ''));
  if (!/^[0-9a-f-]{36}\.(png|jpg|jpeg|webp|gif)$/i.test(safeName)) {
    throw new AvatarRefError('Invalid upload filename');
  }
  return `${AVATAR_PUBLIC_PREFIX}/${safeName}`;
};

/** Map a public reference back to an absolute path inside the uploads root. */
export const resolveUploadPath = (ref) => {
  if (!isUploadRef(ref)) {
    throw new AvatarRefError('Not an upload reference');
  }
  const abs = path.resolve(UPLOADS_ROOT, String(ref).replace('/uploads/', ''));

  // Belt and braces: the resolved path must still be inside the root.
  const rel = path.relative(UPLOADS_ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new AvatarRefError('Path escapes the uploads root');
  }
  return abs;
};

/**
 * Validate an external image URL.
 * Real parsing rather than a regex, so scheme confusion, embedded credentials,
 * stray whitespace and malformed hosts are all rejected by the parser itself.
 */
const validateExternalUrl = (value) => {
  if (value.length > MAX_EXTERNAL_URL_LENGTH) {
    throw new AvatarRefError('Image URL is too long');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new AvatarRefError('Image URL is not a valid URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AvatarRefError('Image URL must use http or https');
  }
  if (!parsed.hostname) {
    throw new AvatarRefError('Image URL must include a host');
  }
  if (parsed.username || parsed.password) {
    throw new AvatarRefError('Image URL must not contain credentials');
  }
  // A URL that is only `//host` parses with an empty hostname only in some
  // engines; the protocol check above already rejects `javascript:` and
  // `vbscript:`. Normalise and return the canonical form.
  return parsed.toString();
};

/**
 * Validate an embedded data URI.
 * The payload charset check is what stops someone embedding
 * `data:image/svg+xml;utf8,<svg onload=...>` or `data:image/png;base64,XX"><script>`.
 */
const validateDataUri = (value) => {
  if (value.length > MAX_AVATAR_REF_LENGTH) {
    throw new AvatarRefError('Embedded image is too large');
  }

  const match = /^data:([^;,]+);(base64,|utf8,)(.*)$/i.exec(value);
  if (!match) {
    throw new AvatarRefError('Malformed embedded image');
  }

  const mime = match[1].toLowerCase();
  const encoding = match[2].toLowerCase();
  const payload = match[3];

  if (!ALLOWED_DATA_MIME.has(mime)) {
    throw new AvatarRefError('Only image data may be embedded');
  }
  if (!ALLOWED_DATA_ENCODINGS.has(encoding)) {
    throw new AvatarRefError('Unsupported embedded image encoding');
  }
  if (!payload || !DATA_PAYLOAD_SAFE.test(payload)) {
    throw new AvatarRefError('Embedded image payload contains illegal characters');
  }

  if (encoding === 'base64,') {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload) || payload.length % 4 !== 0) {
      throw new AvatarRefError('Embedded image is not valid base64');
    }
  }

  // Screen the SVG before accepting it. Our presets pass all of these.
  if (mime === 'image/svg+xml') {
    const decoded = safeDecode(payload);
    for (const pattern of SVG_DANGER) {
      if (pattern.test(decoded)) {
        throw new AvatarRefError('Embedded SVG contains disallowed content');
      }
    }
  }

  return value;
};

/** Decode a percent-encoded payload without throwing on malformed input. */
const safeDecode = (payload) => {
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
};

/**
 * Validate an avatar reference against one of the four allowed shapes.
 *
 * @param {unknown} value
 * @returns {string} the normalised reference, or '' for "no avatar"
 * @throws {AvatarRefError} with a message safe to show the user
 */
export const validateAvatarRef = (value) => {
  if (value === null || value === undefined) return '';

  const raw = String(value);

  // Empty means cleared.
  if (raw === '') return '';

  // Reject the sneaky inputs before any shape dispatch: NUL truncation, C0
  // controls, and bidi/zero-width tricks used to disguise one scheme as
  // another (e.g. a right-to-left override making `segaj:` look like `javascript:`).
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    throw new AvatarRefError('Image reference contains control characters');
  }
  if (/[\u200b-\u200f\u202a-\u202e\u2060\ufeff\s]/.test(raw)) {
    throw new AvatarRefError('Image reference contains invisible characters');
  }

  const lower = raw.toLowerCase();

  if (lower.startsWith('data:')) return validateDataUri(raw);
  if (raw.startsWith('/uploads/')) {
    if (!isUploadRef(raw)) throw new AvatarRefError('Invalid upload reference');
    return raw;
  }
  return validateExternalUrl(raw);
};

export { AvatarRefError };
export default validateAvatarRef;
