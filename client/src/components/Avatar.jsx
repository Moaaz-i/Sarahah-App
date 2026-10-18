import { useState } from 'react';
import { initials } from '../lib/format.js';

/**
 * Avatar with graceful fallback:
 *   valid http(s) URL -> the image
 *   anything else     -> generated initials
 *
 * The backend stores a URL string only (it never fetches or validates it),
 * so a dead link must degrade to initials rather than a broken image icon.
 */
export default function Avatar({ src, name = '', size = 40, username = '' }) {
  const [failed, setFailed] = useState(false);
  const usable = !failed && (/^https?:\/\//i.test(src || '') || /^data:image\//i.test(src || ''));

  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden={!usable}
    >
      {usable ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="avatar__fallback">{initials(name || username)}</span>
      )}
    </span>
  );
}
