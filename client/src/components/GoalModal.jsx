import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import Alert from './Alert.jsx';
import { goalsApi } from '../lib/api.js';
import { categoryOf } from '../lib/feedback.js';
import { useToast } from './Toast.jsx';

/** A date input needs a value in the future; default to a week out. */
const defaultReviewDate = () => {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};

/**
 * Turn a received note into the owner's own commitment.
 *
 * This is the pivot of the whole product: the app stops being a place that
 * receives messages and becomes a place that helps you act on them. Note what
 * is NOT here — there is no score, no claim that the feedback was true, no
 * "effectiveness" rating. Only the owner's intention and their own reflection.
 */
export default function GoalModal({ open, message, onClose }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [action, setAction] = useState('');
  const [useReview, setUseReview] = useState(true);
  const [reviewAt, setReviewAt] = useState(defaultReviewDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Re-seed whenever a different message is opened, so a cancelled draft does
  // not leak into the next goal.
  useEffect(() => {
    if (!open) return;
    setNote('');
    setAction('');
    setUseReview(true);
    setReviewAt(defaultReviewDate());
    setError(null);
  }, [open, message?._id]);

  const category = message ? categoryOf(message.category) : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await goalsApi.create({
        messageId: message?._id ?? null,
        note: note.trim(),
        action: action.trim(),
        ...(useReview && reviewAt ? { reviewAt: new Date(`${reviewAt}T12:00:00`).toISOString() } : {}),
      });
      toast.success('أُنشئ الهدف');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="حوّل الملاحظة إلى هدف" onClose={onClose}>
      {message && (
        <blockquote className="goal-source">
          <span className="goal-source__cat">
            <span aria-hidden="true">{category.icon}</span> {category.label}
          </span>
          <p>{message.content}</p>
        </blockquote>
      )}

      <p className="goal-intro">
        الهدف ملكك وحدك: ما الذي تريد أن تجربه بناءً على هذه الملاحظة؟ لا أحد غيرك يراه.
      </p>

      <form onSubmit={submit} className="stack">
        <label className="field">
          <span className="field__label">ما الذي ستعمل عليه؟</span>
          <input
            className="field__input"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 600))}
            placeholder="مثال: أن أستمع حتى ينهي الطرف الآخر كلامه"
            required
            maxLength={600}
          />
        </label>

        <label className="field">
          <span className="field__label">ما الإجراء الذي ستجرّبه؟ (اختياري)</span>
          <input
            className="field__input"
            value={action}
            onChange={(e) => setAction(e.target.value.slice(0, 600))}
            placeholder="مثال: أنتظر ثلاث ثوانٍ قبل أن أرد"
            maxLength={600}
          />
        </label>

        <label className="field field--check">
          <input
            type="checkbox"
            checked={useReview}
            onChange={(e) => setUseReview(e.target.checked)}
          />
          <span className="field__label">حدّد موعدًا لمراجعة تقدّمك</span>
        </label>

        {useReview && (
          <label className="field">
            <span className="field__label">موعد المراجعة</span>
            <input
              type="date"
              className="field__input"
              value={reviewAt}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setReviewAt(e.target.value)}
            />
          </label>
        )}

        {error && <Alert type="error">{error}</Alert>}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !note.trim()}>
            {busy ? 'جارٍ الحفظ…' : 'إنشاء الهدف'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
