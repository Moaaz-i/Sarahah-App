/** Inline error / info banner. */
export default function Alert({ type = 'error', title, children }) {
  return (
    <div className={`alert alert--${type}`} role={type === 'error' ? 'alert' : 'status'}>
      {title && <strong className="alert__title">{title}</strong>}
      <div className="alert__body">{children}</div>
    </div>
  );
}
