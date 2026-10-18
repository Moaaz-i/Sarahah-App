import { useCallback, useEffect, useState } from 'react';
import { receptionApi } from '../lib/api.js';
import { CATEGORIES, STARTER_PROMPTS } from '../lib/feedback.js';
import Alert from './Alert.jsx';
import Spinner from './Spinner.jsx';
import { useToast } from './Toast.jsx';

/** A single boolean policy row with its explanation. */
function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label className="switch-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="switch-row__text">
        <strong>{label}</strong>
        <span>{hint}</span>
      </span>
    </label>
  );
}

/**
 * Reception policy + guided prompts.
 *
 * The framing throughout is that these are the owner's own rules for what
 * reaches them — not a claim about what is "allowed to be said". The shield is
 * offered as a default that can be turned off, and the quarantine behaviour is
 * explained as a separate section rather than a deletion, because the owner is
 * the one who decides.
 */
export default function ReceptionSettings() {
  const toast = useToast();
  const [state, setState] = useState({ status: 'loading', reception: null, prompts: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const [draft, setDraft] = useState(null);
  const [promptDraft, setPromptDraft] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await receptionApi.get();
      setState({ status: 'ready', reception: data.reception, prompts: data.prompts });
      setDraft(data.reception);
      setPromptDraft(data.prompts);
    } catch (err) {
      setState({ status: 'error', reception: null, prompts: [] });
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await receptionApi.update({
        isPaused: draft.isPaused,
        pauseReason: draft.pauseReason,
        allowedCategories: draft.allowedCategories,
        policyMessage: draft.policyMessage,
        requireCategory: draft.requireCategory,
        enableShield: draft.enableShield,
        quarantineFlagged: draft.quarantineFlagged,
      });
      await receptionApi.replacePrompts(promptDraft.filter((p) => p.text.trim().length >= 3));
      await load();
      setSaved(true);
      toast.success('حُفظت إعدادات الاستقبال');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (state.status === 'loading') return <Spinner label="جارٍ تحميل إعدادات الاستقبال…" />;
  if (state.status === 'error') return <Alert type="error">{error}</Alert>;

  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };

  /** Empty selection means "everything" — the honest default for a new user. */
  const toggleCategory = (key) => {
    const current = draft.allowedCategories ?? [];
    set({
      allowedCategories: current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    });
  };

  const onlyAllowed = (draft.allowedCategories ?? []).length > 0;

  return (
    <div className="reception">
      {error && <Alert type="error">{error}</Alert>}
      {saved && <Alert type="success">حُفظت التغييرات.</Alert>}

      <Switch
        checked={draft.isPaused}
        onChange={(v) => set({ isPaused: v, ...(v ? {} : { pauseReason: '' }) })}
        label="إيقاف استقبال الرسائل مؤقتًا"
        hint="لا يُحذف حسابك ولا رسائلك — تُظهر صفحتك للزائر أنه لا يمكنه الإرسال الآن، بنفس شكل الحساب غير الموجود."
      />
      {draft.isPaused && (
        <label className="field">
          <span className="field__label">سبب الإيقاف (يظهر للزائر)</span>
          <input
            className="field__input"
            value={draft.pauseReason}
            maxLength={200}
            onChange={(e) => set({ pauseReason: e.target.value })}
            placeholder="مثال: سأعود للقراءة بعد امتحاناتي"
          />
        </label>
      )}

      <label className="field">
        <span className="field__label">رسالة سياسة الاستقبال (اختياري)</span>
        <textarea
          className="field__input"
          rows={3}
          maxLength={400}
          value={draft.policyMessage}
          onChange={(e) => set({ policyMessage: e.target.value })}
          placeholder="مثال: أرحب بالملاحظات الصريحة عن سلوكي، ولا أريد الإساءة."
        />
        <span className="field__hint">تظهر أعلى صفحة الزائر قبل أن يكتب.</span>
      </label>

      <div className="field">
        <span className="field__label">أنواع الملاحظات التي تقبلها</span>
        <div className="reception-cats">
          {CATEGORIES.map((c) => {
            const active = !onlyAllowed || draft.allowedCategories.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                className={`toggle-chip${active ? ' toggle-chip--active' : ''}`}
                aria-pressed={active}
                onClick={() => toggleCategory(c.key)}
              >
                {c.icon} {c.label}
              </button>
            );
          })}
        </div>
        <span className="field__hint">
          {onlyAllowed
            ? 'الأنواع غير المحددة لن تصل إليك، ويرفض الإرسال لها بهوية غير موجودة حتى لا يعرف المرسل أنك أوقفتها.'
            : 'لا تحدّد أيًا — هذا هو الوضع الافتراضي وتصل إليك كل الأنواع.'}
        </span>
      </div>

      <Switch
        checked={draft.requireCategory}
        onChange={(v) => set({ requireCategory: v })}
        label="اطلب من المرسل اختيار نوع الملاحظة"
        hint="يُفرض على الخادم أيضًا، لا في الواجهة فقط: يُرفض الإرسال بلا نوع."
      />

      <Switch
        checked={draft.enableShield}
        onChange={(v) => set({ enableShield: v })}
        label="تفعيل درع الصراحة"
        hint="فحص محلي بالقواعد على النص — لا يغادر الخادم أي شيء. يعرض للمرسل تنبيهًا لطيفًا قبل الإرسال."
      />

      <Switch
        checked={draft.quarantineFlagged}
        onChange={(v) => set({ quarantineFlagged: v })}
        label="وضع الرسائل المشبوهة في قسم منفصل"
        hint="لا تُحذف ولا تُخفى نهائيًا: تظهر في «رسائل محفوظة لك» وقرار قراءتها أو إدراجها لك وحدك."
        disabled={!draft.enableShield}
      />

      <div className="field">
        <span className="field__label">أسئلة موجّهة للمرسل (حتى 6)</span>
        <p className="field__hint">
          تظهر أسئلتك لمن يفتح صفحتك، فيجيب عن سؤال بدل أن يواجه مربعًا فارغًا.
        </p>
        <div className="prompt-list">
          {promptDraft.map((p, i) => (
            <div key={p.id ?? i} className="prompt-row">
              <input
                type="text"
                className="field__input"
                value={p.text}
                maxLength={160}
                onChange={(e) =>
                  setPromptDraft((list) =>
                    list.map((item, idx) => (idx === i ? { ...item, text: e.target.value } : item)),
                  )
                }
              />
              <button
                type="button"
                className="prompt-row__remove"
                aria-label="حذف السؤال"
                onClick={() => setPromptDraft((list) => list.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="row-between" style={{ marginTop: '0.7rem' }}>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            disabled={promptDraft.length >= 6}
            onClick={() =>
              setPromptDraft((list) => [
                ...list,
                { id: `new_${Date.now()}`, text: '', isActive: true },
              ])
            }
          >
            + إضافة سؤال
          </button>
          {promptDraft.length === 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() =>
                setPromptDraft(
                  STARTER_PROMPTS.map((text, i) => ({
                    id: `starter_${i}`,
                    text,
                    isActive: true,
                  })),
                )
              }
            >
              استخدام أسئلة جاهزة
            </button>
          )}
        </div>
      </div>

      <div className="modal__actions">
        <button type="button" className="btn btn--outline" onClick={load} disabled={busy}>
          تراجع
        </button>
        <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ إعدادات الاستقبال'}
        </button>
      </div>
    </div>
  );
}
