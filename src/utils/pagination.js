/**
 * Pagination helpers.
 * - Messages use cursor pagination (stable while new messages arrive).
 * - Admin listings (reports, users) use classic page/limit pagination.
 */

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;

/** Parse a positive integer query param with a default and a max. */
export const parseLimit = (value, fallback = DEFAULT_PAGE_LIMIT, max = MAX_PAGE_LIMIT) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

/** Parse a 1-based page number. */
export const parsePage = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
};

/** Encode an ObjectId (or date) into an opaque cursor string. */
export const encodeCursor = (id) => Buffer.from(String(id)).toString('base64url');

/** Decode and validate a cursor back into an ObjectId string. */
export const decodeCursor = (cursor) => {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(String(cursor), 'base64url').toString('utf8');
    return /^[0-9a-fA-F]{24}$/.test(decoded) ? decoded.toLowerCase() : null;
  } catch {
    return null;
  }
};

/** Build the pagination envelope for page-based listings. */
export const pageMeta = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNextPage: page * limit < total,
});

/** Build the pagination envelope for cursor-based listings. */
export const cursorMeta = ({ limit, items, nextCursor }) => ({
  limit,
  nextCursor,
  hasMore: Boolean(nextCursor),
  count: items.length,
});

export default { parseLimit, parsePage, encodeCursor, decodeCursor, pageMeta, cursorMeta };
