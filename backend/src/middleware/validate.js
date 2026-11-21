const HttpError = require('../utils/httpError');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+()\-\s]{7,15}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const blank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * rules = { field: { required, type, min, max, minLength, maxLength, oneOf, label } }
 * type: 'email' | 'phone' | 'int' | 'number' | 'date' | 'boolean'
 * Trims strings in place and turns blank optional values into null.
 */
function check(rules, body) {
  const errors = {};
  for (const [field, rule] of Object.entries(rules)) {
    const label = rule.label || field.replace(/_/g, ' ');
    let value = body[field];
    if (typeof value === 'string') {
      value = value.trim();
      body[field] = value;
    }
    if (blank(value)) {
      if (rule.required) errors[field] = `Enter ${label}`;
      else if (field in body) body[field] = null;
      continue;
    }
    switch (rule.type) {
      case 'email':
        if (!EMAIL.test(value)) errors[field] = 'Enter a valid email address';
        break;
      case 'phone':
        if (!PHONE.test(value)) errors[field] = 'Enter a valid phone number';
        break;
      case 'int':
        if (!/^-?\d+$/.test(String(value))) errors[field] = `${label} must be a whole number`;
        break;
      case 'number':
        if (isNaN(Number(value))) errors[field] = `${label} must be a number`;
        break;
      case 'date':
        if (!DATE.test(value) || isNaN(new Date(value))) errors[field] = `Enter a valid ${label}`;
        break;
      case 'boolean':
        if (typeof value !== 'boolean') errors[field] = `${label} must be true or false`;
        break;
      default:
    }
    if (errors[field]) continue;
    if (rule.minLength && String(value).length < rule.minLength) errors[field] = `${label} must be at least ${rule.minLength} characters`;
    else if (rule.maxLength && String(value).length > rule.maxLength) errors[field] = `${label} must be at most ${rule.maxLength} characters`;
    else if (rule.min !== undefined && Number(value) < rule.min) errors[field] = `${label} must be at least ${rule.min}`;
    else if (rule.max !== undefined && Number(value) > rule.max) errors[field] = `${label} must be at most ${rule.max}`;
    else if (rule.oneOf && !rule.oneOf.includes(value)) errors[field] = `Choose a valid ${label}`;
  }
  return errors;
}

function assertValid(rules, body) {
  const errors = check(rules, body);
  if (Object.keys(errors).length) throw new HttpError(400, 'Please correct the highlighted fields', errors);
}

const validate = (rules) => (req, res, next) => {
  try {
    assertValid(rules, req.body || {});
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { check, assertValid, validate };
