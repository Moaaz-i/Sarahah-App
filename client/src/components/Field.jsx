/** Controlled text/textarea field with a label and inline error slot. */
export default function Field({
  label,
  hint,
  error,
  as = 'input',
  id,
  children,
  ...rest
}) {
  const inputId = id || rest.name;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      {as === 'textarea' ? (
        <textarea id={inputId} aria-describedby={describedBy} {...rest} />
      ) : as === 'select' ? (
        <select id={inputId} aria-describedby={describedBy} {...rest}>
          {children}
        </select>
      ) : (
        <input id={inputId} aria-describedby={describedBy} {...rest} />
      )}
      {hint && !error && (
        <p className="field__hint" id={`${inputId}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${inputId}-err`}>
          {error}
        </p>
      )}
    </div>
  );
}
