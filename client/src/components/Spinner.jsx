export default function Spinner({ label = 'جارٍ التحميل…', inline = false }) {
  if (inline) {
    return (
      <span className="spinner spinner--inline" role="status" aria-label={label}>
        <span className="spinner__ring" />
      </span>
    );
  }
  return (
    <div className="spinner-block" role="status" aria-live="polite">
      <span className="spinner__ring" />
      <p className="spinner__label">{label}</p>
    </div>
  );
}
