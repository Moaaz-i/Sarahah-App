import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';
import env from '../config/env.js';

let configured = false;

/**
 * Configure Cloudinary instance lazily or on import.
 */
export const getCloudinary = () => {
  if (configured) return cloudinary;

  if (env.cloudinary.url) {
    cloudinary.config({ cloudinary_url: env.cloudinary.url });
    configured = true;
  } else if (env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret) {
    cloudinary.config({
      cloud_name: env.cloudinary.cloudName,
      api_key: env.cloudinary.apiKey,
      api_secret: env.cloudinary.apiSecret,
      secure: true,
    });
    configured = true;
  }

  return cloudinary;
};

export const isCloudinaryEnabled = () => !env.isTest && env.cloudinary.enabled;

/**
 * Upload an image buffer to Cloudinary using upload_stream.
 *
 * @param {Buffer} buffer - Raw verified image bytes
 * @param {Object} options
 * @param {string} [options.folder='sar7ny/avatars']
 * @param {string} [options.publicId]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
export const uploadImageBuffer = (buffer, options = {}) => {
  const cld = getCloudinary();
  const folder = options.folder || 'sar7ny/avatars';

  return new Promise((resolve, reject) => {
    const uploadStream = cld.uploader.upload_stream(
      {
        folder,
        public_id: options.publicId,
        overwrite: true,
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve({
          url: result.secure_url || result.url,
          publicId: result.public_id,
        });
      },
    );

    const readable = new Readable();
    readable._read = () => {};
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Extract public_id from a Cloudinary URL.
 * e.g. https://res.cloudinary.com/cloud_name/image/upload/v12345/sar7ny/avatars/abc.webp -> sar7ny/avatars/abc
 */
export const extractPublicId = (url) => {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('cloudinary.com')) return null;

  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    const uploadIdx = parts.indexOf('upload');
    if (uploadIdx === -1) return null;

    // Skip version tag (e.g. v1234567890) if present
    const sliceIdx = parts[uploadIdx + 1]?.startsWith('v') && /^\d+$/.test(parts[uploadIdx + 1].slice(1))
      ? uploadIdx + 2
      : uploadIdx + 1;

    const remaining = parts.slice(sliceIdx).join('/');
    // Strip file extension
    const dotIdx = remaining.lastIndexOf('.');
    return dotIdx !== -1 ? remaining.slice(0, dotIdx) : remaining;
  } catch {
    return null;
  }
};

/**
 * Delete an image from Cloudinary by publicId or URL.
 * Never throws to callers; swallows errors and returns boolean.
 */
export const deleteCloudinaryImage = async (urlOrPublicId) => {
  if (!urlOrPublicId) return false;
  if (!isCloudinaryEnabled()) return false;

  const publicId = urlOrPublicId.includes('cloudinary.com')
    ? extractPublicId(urlOrPublicId)
    : urlOrPublicId;

  if (!publicId) return false;

  try {
    const cld = getCloudinary();
    const res = await cld.uploader.destroy(publicId, { invalidate: true });
    return res?.result === 'ok';
  } catch (err) {
    console.error('[cloudinary] delete failed for:', publicId, err?.message || err);
    return false;
  }
};

export default {
  getCloudinary,
  isCloudinaryEnabled,
  uploadImageBuffer,
  extractPublicId,
  deleteCloudinaryImage,
};

