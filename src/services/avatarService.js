import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, rm } from 'node:fs/promises';
import path from 'node:path';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import {
  UPLOADS_ROOT,
  AVATAR_DIR,
  UPLOADABLE_TYPES,
  UPLOADABLE_MIME_LIST,
  MAX_AVATAR_BYTES,
  isUploadRef,
  resolveUploadPath,
  toUploadRef,
} from '../utils/imageRef.js';

/**
 * Avatar upload handling.
 *
 * The route layer parses the multipart body with `multer` (memory storage) and
 * hands `avatarService.storeAvatar` a Buffer. Multer exists only to parse
 * multipart/form-data; every security decision (type, size, magic bytes,
 * filesystem containment) is made here or in `imageRef.js`.
 *
 * THE FILE IS VERIFIED BY ITS BYTES, NOT ITS NAME
 * A declared content-type is attacker-controlled. Every upload is sniffed by
 * magic bytes; the extension we write is derived from what the file actually
 * *is*. A PHP script or an HTML file renamed to `.png` fails the sniff and is
 * refused, and because we serve from a directory with `nosniff` on, a refusal
 * cannot be turned into a stored-XSS.
 *
 * SVG IS REFUSED ON UPLOAD
 * Browsers do not execute scripts inside SVG loaded through `<img>`, but an
 * SVG uploaded as a file could later be opened directly, where those scripts
 * do run. Raster-only keeps that entire question closed. The built-in presets
 * are self-contained SVGs we author ourselves and travel as data URIs, which
 * are screened separately in `imageRef.js`.
 */

const AVATARS_ABS = path.join(UPLOADS_ROOT, AVATAR_DIR);

/**
 * Magic-byte signatures. Order matters only in that each is an exact prefix
 * check, so no two can match the same buffer.
 */
const SIGNATURES = [
  { mime: 'image/png', header: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', header: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', ascii: ['GIF87a', 'GIF89a'] },
  { mime: 'image/webp', riff: 'WEBP' },
];

/** Read an ASCII string at an offset, for RIFF-style signatures. */
const asciiAt = (buffer, offset, length) =>
  buffer.length >= offset + length ? buffer.subarray(offset, offset + length).toString('latin1') : '';

/**
 * Determine what a buffer actually is.
 *
 * @param {Buffer} buffer
 * @returns {{ mime: string, ext: string }|null} null when nothing matches
 */
export const sniffImage = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  for (const sig of SIGNATURES) {
    if (sig.header) {
      if (sig.header.every((byte, i) => buffer[i] === byte)) {
        return { mime: sig.mime, ext: UPLOADABLE_TYPES[sig.mime] };
      }
    }
    if (sig.ascii) {
      if (sig.ascii.some((prefix) => asciiAt(buffer, 0, prefix.length) === prefix)) {
        return { mime: sig.mime, ext: UPLOADABLE_TYPES[sig.mime] };
      }
    }
    if (sig.riff) {
      // RIFF header, 4-byte little-endian size, then the form type.
      if (asciiAt(buffer, 0, 4) === 'RIFF' && asciiAt(buffer, 8, 4) === sig.riff) {
        return { mime: sig.mime, ext: UPLOADABLE_TYPES[sig.mime] };
      }
    }
  }
  return null;
};

/**
 * Ensure the directory exists. Idempotent and safe to call per request; the
 * cost is one failed syscall the first time and nothing thereafter.
 */
const ensureDir = () => mkdir(AVATARS_ABS, { recursive: true });

/**
 * Delete a stored avatar file, but ONLY if it resolves inside our uploads
 * root. A caller can never name an arbitrary path: `isUploadRef` already
 * constrains the shape to our own UUID, and `resolveUploadPath` re-checks the
 * resolved path after traversal resolution.
 */
export const removeStoredAvatar = async (ref) => {
  if (!ref || !isUploadRef(ref)) return false;

  let abs;
  try {
    abs = resolveUploadPath(ref);
  } catch {
    return false;
  }

  // Final containment check, kept explicit because deleting outside the root
  // is the one failure mode that must never happen.
  const rel = path.relative(UPLOADS_ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;

  try {
    await unlink(abs);
    return true;
  } catch {
    // Already gone, or never written: nothing to do.
    return false;
  }
};

/**
 * Store an uploaded avatar.
 *
 * @param {Buffer} buffer      raw file bytes, already size-checked by the route
 * @param {string} declaredMime the client's claim, used only as a cross-check
 * @returns {Promise<string>} the public reference to store in `User.avatar`
 */
export const storeAvatar = async (buffer, declaredMime = '') => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw AppError.badRequest('No image was uploaded');
  }
  // Backstop only: the route-level `express.raw()` limit rejects oversize
  // bodies with 413 before this runs. Keeping the check here means the
  // invariant travels with the function rather than depending on the caller.
  if (buffer.length > MAX_AVATAR_BYTES) {
    throw AppError.badRequest('Image is too large');
  }

  const detected = sniffImage(buffer);
  if (!detected) {
    throw AppError.validation([
      {
        field: 'image',
        message: 'File is not a PNG, JPEG, GIF or WebP image',
        code: 'UNSUPPORTED_IMAGE',
      },
    ]);
  }

  // A mismatch is not automatically hostile (some browsers mislabel WebP),
  // but a *naming* mismatch is worth refusing loudly rather than silently
  // renaming something the client believes is a different format.
  if (declaredMime && UPLOADABLE_MIME_LIST.includes(declaredMime)) {
    if (declaredMime !== detected.mime) {
      throw AppError.validation([
        {
          field: 'image',
          message: `File content is ${detected.mime}, but was uploaded as ${declaredMime}`,
          code: 'IMAGE_TYPE_MISMATCH',
        },
      ]);
    }
  }

  await ensureDir();

  // A fresh UUID means the filename leaks nothing — no username, no timestamp,
  // no original name — and makes guessing another user's file pointless.
  const filename = `${randomUUID()}.${detected.ext}`;
  const abs = path.join(AVATARS_ABS, filename);

  await writeFile(abs, buffer, { flag: 'wx', mode: 0o644 });

  return toUploadRef(filename);
};

/**
 * Remove every stored avatar for a user during account deletion.
 * Called from the account-deletion path so a hard delete leaves no orphaned
 * files behind on disk.
 */
export const cleanupAvatars = async (refs = []) => {
  let removed = 0;
  for (const ref of refs) {
    if (await removeStoredAvatar(ref)) removed += 1;
  }
  return removed;
};

/** Remove the whole avatars directory. Used by tests, never by the app. */
export const clearAvatarStore = async () => {
  await rm(AVATARS_ABS, { recursive: true, force: true });
};

export { AVATARS_ABS };
export default { storeAvatar, removeStoredAvatar, cleanupAvatars, sniffImage };
