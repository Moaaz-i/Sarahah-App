/**
 * Google profile-photo URL handling.
 *
 * Google's ID token returns the `picture` claim as an
 * `https://lh3.googleusercontent.com/...` URL whose requested size is encoded
 * in a trailing `=sNNN` parameter. The claim always asks for a 64px
 * thumbnail, which is noticeably soft at the sizes this UI renders (34px in
 * the nav, 84px on a public profile, 96px in settings — and twice that on a
 * retina display).
 *
 * Asking for a larger size is free: the parameter is server-side, so we only
 * rewrite the number and keep any flags that follow it (e.g. `-c` = crop to
 * square, which keeps the avatar round rather than oval).
 *
 * Deliberately best-effort and pure:
 *  - anything that is not a Google photo URL is returned untouched;
 *  - no network call is made, so a claim we cannot recognise simply stays as
 *    Google sent it and the <Avatar> component falls back to initials if it
 *    turns out to be unloadable.
 */

/** Size we request instead of Google's 64px default. */
export const GOOGLE_PHOTO_SIZE = 192;

// Only Google's own image hosts — never rewrite a URL we do not recognise.
const GOOGLE_PHOTO_HOST = /^https:\/\/lh\d+\.googleusercontent\.com\//i;
// Matches `=s64`, `=s64-c`, `=s64-c-mo`, ... — the number only.
const SIZE_PARAM = /=s(\d+)/i;

/**
 * Return `url` asking for GOOGLE_PHOTO_SIZE instead of whatever size Google
 * sent. Non-Google URLs and URLs without a size parameter pass through as-is.
 */
export const enlargeGooglePhoto = (url) => {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value || !SIZE_PARAM.test(value)) return value;
  if (!GOOGLE_PHOTO_HOST.test(value)) return value;

  return value.replace(SIZE_PARAM, `=s${GOOGLE_PHOTO_SIZE}`);
};

export default enlargeGooglePhoto;
