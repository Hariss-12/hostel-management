const pad = (n) => String(n).padStart(2, '0');

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// '' / undefined / garbage -> null, otherwise an integer
const optInt = (v) => (v === undefined || v === null || v === '' || !/^\d+$/.test(String(v)) ? null : Number(v));

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s));
const isMonth = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

const MEAL_TYPES = ['breakfast', 'lunch', 'snacks', 'dinner'];

module.exports = { today, optInt, isDate, isMonth, MEAL_TYPES };
