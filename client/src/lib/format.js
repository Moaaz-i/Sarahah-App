/** Small formatting + display helpers shared by the UI. */

export const REPORT_REASONS = [
  { value: 'harassment', label: 'تحرّش' },
  { value: 'threats', label: 'تهديدات' },
  { value: 'hate_speech', label: 'خطاب كراهية' },
  { value: 'spam', label: 'رسائل مزعجة' },
  { value: 'sexual_content', label: 'محتوى جنسي' },
  { value: 'other', label: 'أخرى' },
];

export const REPORT_STATUSES = [
  { value: 'pending', label: 'قيد الانتظار' },
  { value: 'reviewed', label: 'تمت المراجعة' },
  { value: 'resolved', label: 'تم الحل' },
  { value: 'rejected', label: 'مرفوض' },
];

export const reasonLabel = (value) =>
  REPORT_REASONS.find((r) => r.value === value)?.label || value;

export const statusLabel = (value) =>
  REPORT_STATUSES.find((s) => s.value === value)?.label || value;

export function formatDate(value, opts) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...opts,
  }).format(date);
}

export function relativeTime(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const units = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(-diff / ms), unit);
  }
  return 'الآن';
}

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase() || '؟';

export const shortId = (id = '') => (id ? `${String(id).slice(0, 8)}…` : '—');
