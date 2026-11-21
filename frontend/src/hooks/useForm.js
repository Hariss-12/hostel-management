import { useState } from 'react';
import { validateFields } from '../utils/validators';

// Small controlled-form helper: values, field errors, change handler and validation
export default function useForm(initial, spec = {}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setValues((v) => ({ ...v, [name]: type === 'checkbox' ? checked : value }));
    setErrors((er) => (er[name] ? { ...er, [name]: undefined } : er));
  };

  const setValue = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  const validate = (extra) => {
    const errs = { ...validateFields(values, spec), ...(extra ? extra(values) : {}) };
    Object.keys(errs).forEach((k) => !errs[k] && delete errs[k]);
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const reset = (next = initial) => {
    setValues(next);
    setErrors({});
  };

  return { values, errors, setErrors, handleChange, setValue, setValues, validate, reset };
}
