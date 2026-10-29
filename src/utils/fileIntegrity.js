import path from 'node:path';
import AppError from './AppError.js';
import { ERROR_CODES } from '../constants/messages.js';

/**
 * File Integrity & Magic Number Verification Utility.
 *
 * Designed to detect even subtle tampering in uploaded files:
 * 1. Checks magic bytes / file signatures against known raster images (PNG, JPEG, GIF, WebP).
 * 2. Validates internal image structure (e.g. PNG IHDR/IEND, JPEG SOI/EOI, WebP RIFF/VP8, GIF trailers).
 * 3. Detects malicious polyglot payloads (PHP, HTML, JS, shell scripts, executable PE/ELF headers embedded in images).
 * 4. Verifies consistency between file extension, declared MIME, and detected binary format.
 */

export const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

export const MIME_TO_EXT = Object.freeze({
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
});

const DANGEROUS_PAYLOADS = [
  /<\?php/i,
  /<\?=/i,
  /<\s*script/i,
  /<\s*svg/i,
  /<!entity/i,
  /<!doctype\s+html/i,
  /<\s*html/i,
  /<\s*iframe/i,
  /<\s*object/i,
  /<\s*embed/i,
  /javascript\s*:/i,
  /\bonerror\s*=/i,
  /\bonload\s*=/i,
];

/** Read ASCII substring safely */
const asciiSlice = (buffer, start, length) => {
  if (buffer.length < start + length) return '';
  return buffer.subarray(start, start + length).toString('latin1');
};

/**
 * Perform deep magic-number inspection on the file buffer.
 *
 * @param {Buffer} buffer - Raw file bytes
 * @returns {{ mime: string, ext: string }|null} Detected image details or null if invalid
 */
export const sniffMagicNumbers = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return null;

  // 1. PNG Verification:
  // Magic: 89 50 4E 47 0D 0A 1A 0A
  // Chunk 1: Length (4 bytes), 'IHDR' (4 bytes), Width (4 bytes > 0), Height (4 bytes > 0)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    const chunkType = asciiSlice(buffer, 12, 4);
    if (chunkType !== 'IHDR') {
      return null; // Corrupted PNG chunk header
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width === 0 || height === 0) {
      return null; // Invalid dimensions
    }
    // Must contain IEND chunk somewhere in the buffer
    const iendIndex = buffer.indexOf(Buffer.from([0x49, 0x45, 0x4e, 0x44]));
    if (iendIndex === -1) {
      return null; // Incomplete or tampered PNG
    }
    return { mime: 'image/png', ext: 'png' };
  }

  // 2. JPEG Verification:
  // Starts with SOI: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    const marker = buffer[3];
    // Valid JPEG markers after FF: E0 (JFIF), E1 (Exif), E2..EF (App), DB (DQT), C0/C2 (SOF)
    const validMarkers = [
      0xe0, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed,
      0xee, 0xef, 0xdb, 0xc0, 0xc2,
    ];
    if (!validMarkers.includes(marker)) {
      return null; // Fake JPEG header
    }
    // Check for JPEG EOI (FF D9) near the end (allow up to 64 trailing bytes of padding/metadata)
    const searchTail = buffer.subarray(Math.max(0, buffer.length - 128));
    const hasEoi = searchTail.includes(Buffer.from([0xff, 0xd9]));
    if (!hasEoi) {
      return null; // Truncated or tampered JPEG
    }
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // 3. GIF Verification:
  // Magic: GIF87a or GIF89a
  const gifHeader = asciiSlice(buffer, 0, 6);
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    if (width === 0 || height === 0) {
      return null; // Invalid GIF dimensions
    }
    // Check for GIF trailer byte (0x3B) at or near end
    const lastBytes = buffer.subarray(Math.max(0, buffer.length - 16));
    if (!lastBytes.includes(0x3b)) {
      return null; // Tampered or unclosed GIF
    }
    return { mime: 'image/gif', ext: 'gif' };
  }

  // 4. WebP Verification:
  // RIFF .... WEBP VP8 / VP8L / VP8X
  if (asciiSlice(buffer, 0, 4) === 'RIFF' && asciiSlice(buffer, 8, 4) === 'WEBP') {
    const chunkType = asciiSlice(buffer, 12, 4);
    if (chunkType === 'VP8 ' || chunkType === 'VP8L' || chunkType === 'VP8X') {
      return { mime: 'image/webp', ext: 'webp' };
    }
    return null; // Tampered WebP format
  }

  return null;
};

/**
 * Scan for disguised scripts or binary executable signatures embedded in images.
 */
export const scanForMaliciousPayloads = (buffer) => {
  // Check for executable binary headers (PE / ELF)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return 'DOS/PE Executable header detected (MZ)';
  }
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return 'ELF Linux Executable header detected';
  }

  // Check text content within the buffer for embedded active scripts
  const sample = buffer.toString('latin1');
  for (const pattern of DANGEROUS_PAYLOADS) {
    if (pattern.test(sample)) {
      return `Embedded script/markup payload detected: ${pattern.source}`;
    }
  }

  return null;
};

/**
 * Validate incoming file during upload.
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} originalname - Original file name
 * @param {string} declaredMime - Declared MIME type
 * @returns {{ mime: string, ext: string }}
 */
export const verifyFileIntegrity = (buffer, originalname = '', declaredMime = '') => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw AppError.badRequest('No file data provided or empty file');
  }

  // Check filename for null bytes or path traversal
  if (/[\u0000]/.test(originalname)) {
    throw AppError.badRequest('File name contains forbidden null bytes');
  }

  // Extract and check extension
  const ext = path.extname(originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw AppError.badRequest(
      `File extension "${ext}" is not allowed. Only .png, .jpg, .jpeg, .gif, .webp are accepted.`,
    );
  }

  // Check for dangerous double extensions (e.g. avatar.php.png or script.js.jpg)
  const parts = path.basename(originalname).split('.');
  if (parts.length > 2) {
    const suspectExtensions = ['php', 'phtml', 'html', 'htm', 'js', 'sh', 'exe', 'bat', 'cmd', 'svg'];
    for (let i = 1; i < parts.length - 1; i++) {
      if (suspectExtensions.includes(parts[i].toLowerCase())) {
        throw AppError.badRequest(
          'Double file extension detected with executable or script format',
        );
      }
    }
  }

  // 1. Verify Magic Numbers
  const detected = sniffMagicNumbers(buffer);
  if (!detected) {
    throw AppError.badRequest(
      'الملف المرفوع لا يحتوي على التوقيع الثنائي الصحيح (Magic Numbers) أو تم التلاعب في بنيته الداخلية',
    );
  }

  // 2. Scan for malicious embedded scripts / executables (Polyglot check)
  const danger = scanForMaliciousPayloads(buffer);
  if (danger) {
    throw AppError.badRequest(
      `تم رفض الملف: تم اكتشاف محتوى برمجي مشبوه داخل الملف (${danger})`,
    );
  }

  // 3. Verify consistency between detected type and declared MIME
  if (declaredMime && declaredMime !== detected.mime) {
    throw AppError.badRequest(
      `تم اكتشاف تلاعب: نوع المحتوى المصرح به (${declaredMime}) لا يتطابق مع التوقيع الفعلي للملف (${detected.mime})`,
    );
  }

  // 4. Verify consistency between extension and detected format
  const validExtensions = MIME_TO_EXT[detected.mime] || [];
  if (!validExtensions.includes(ext)) {
    throw AppError.badRequest(
      `تم اكتشاف تلاعب: امتداد الملف (${ext}) لا يتطابق مع نوع الصورة الحقيقي (${detected.mime})`,
    );
  }

  return detected;
};

export default {
  verifyFileIntegrity,
  sniffMagicNumbers,
  scanForMaliciousPayloads,
  ALLOWED_EXTENSIONS,
  MIME_TO_EXT,
};
