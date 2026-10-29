import { useState } from 'react';
import { reportsApi, ApiError } from '../lib/api.js';
import { REPORT_REASONS } from '../lib/format.js';
import { useToast } from './Toast.jsx';
import Modal from './Modal.jsx';
import Alert from './Alert.jsx';
import Field from './Field.jsx';

/** Report a message the caller received (works signed-in or anonymously). */
export default function ReportModal({ open, onClose, messageId }) {
  const toast = useToast();
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await reportsApi.create({ messageId, reason, details: details.trim() });
      toast.success('تم استلام البلاغ، شكرًا لمساعدتك');
      setDetails('');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('لقد أرسلت بلاغًا مسبقًا على هذه الرسالة.');
      } else if (err instanceof ApiError && err.status === 429) {
        setError('تجاوزت حد البلاغات المسموح به اليوم.');
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="الإبلاغ عن رسالة">
      <form onSubmit={submit}>
        {error && <Alert type="error">{error}</Alert>}

        <div className="field">
          <label className="field__label">سبب البلاغ:</label>
          <div className="radio-group" role="radiogroup" aria-label="سبب البلاغ">
            {REPORT_REASONS.map((r) => (
              <label
                key={r.value}
                className={`radio-card ${reason === r.value ? 'radio-card--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                />
                <span className="radio-card__label">{r.label}</span>
              </label>
            ))}
          </div>
        </div>

        <Field
          as="textarea"
          label="تفاصيل (اختياري)"
          name="details"
          rows={4}
          maxLength={1000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          hint="أي سياق يساعد المشرف على القرار — حتى 1000 حرف."
        />

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button type="submit" className="btn btn--danger" disabled={busy}>
            {busy ? 'جارٍ الإرسال…' : 'إرسال البلاغ'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
