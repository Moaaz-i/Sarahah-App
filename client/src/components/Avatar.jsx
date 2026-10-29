import { useState } from 'react';
import { initials } from '../lib/format.js';
import { resolveUploadUrl } from '../lib/api.js';

/**
 * Avatar with graceful fallback:
 *   absolute http(s) URL -> the image
 *   data:image/...      -> the embedded image
 *   /uploads/...        -> resolved against the API origin
 *   anything else       -> generated initials
 *
 * The backend stores a URL string only (it never fetches or validates it),
 * so a dead link must degrade to initials rather than a broken image icon.
 */
export default function Avatar({ src, name = '', size = 40, username = '' }) {
  const [failed, setFailed] = useState(false);
  const usableSrc = resolveUploadUrl(src);
  const usable =
    !failed &&
    (/^https?:\/\//i.test(usableSrc || '') || /^data:image\//i.test(usableSrc || ''));

  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden={!usable}
    >
      {usable ? (
        <img src={usableSrc} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="avatar__fallback">{initials(name || username)}</span>
      )}
    </span>
  );
}
