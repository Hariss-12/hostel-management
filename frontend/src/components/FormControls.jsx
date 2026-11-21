// Reusable form fields. Each one shows its own label and validation message.
export function Field({ label, error, hint, required, children, className = '' }) {
  return (
    <label className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && <span className="field-label">{label}{required && <i aria-hidden="true"> *</i>}</span>}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Input({ label, error, hint, required, className, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      <input {...props} />
    </Field>
  );
}

export function TextArea({ label, error, hint, required, className, rows = 3, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      <textarea rows={rows} {...props} />
    </Field>
  );
}

// options: ['a', 'b'] or [{ value, label }]
export function Select({ label, error, hint, required, className, options = [], placeholder, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      <select {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === 'object' ? o : { value: o, label: o };
          return <option key={opt.value} value={opt.value}>{opt.label}</option>;
        })}
      </select>
    </Field>
  );
}
