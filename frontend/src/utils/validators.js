const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+()\-\s]{7,15}$/;

const blank = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * spec = { field: { label, required, type: 'email'|'phone'|'number'|'int'|'date', min, max, minLength, maxLength } }
 * Returns { field: 'message' } (empty object when everything is valid).
 */
export function validateFields(values, spec) {
  const errors = {};
  for (const [field, rule] of Object.entries(spec)) {
    const name = rule.label || field.replace(/_/g, ' ');
    const value = values[field];
    if (blank(value)) {
      if (rule.required) errors[field] = `Enter ${name}`;
      continue;
    }
    const v = String(value).trim();
    if (rule.type === 'email' && !EMAIL.test(v)) errors[field] = 'Enter a valid email address';
    else if (rule.type === 'phone' && !PHONE.test(v)) errors[field] = 'Enter a valid phone number';
    else if (rule.type === 'int' && !/^-?\d+$/.test(v)) errors[field] = `${name} must be a whole number`;
    else if (rule.type === 'number' && isNaN(Number(v))) errors[field] = `${name} must be a number`;
    else if (rule.minLength && v.length < rule.minLength) errors[field] = `${name} must be at least ${rule.minLength} characters`;
    else if (rule.maxLength && v.length > rule.maxLength) errors[field] = `${name} must be at most ${rule.maxLength} characters`;
    else if (rule.min !== undefined && Number(v) < rule.min) errors[field] = `${name} must be at least ${rule.min}`;
    else if (rule.max !== undefined && Number(v) > rule.max) errors[field] = `${name} must be at most ${rule.max}`;
  }
  return errors;
}
