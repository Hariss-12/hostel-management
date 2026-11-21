const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

export const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);

// 'YYYY-MM-DD' (or ISO timestamp) -> '05 Mar 2026'
export const fmtDate = (value) => {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
};

export const fmtDateTime = (value) => {
  if (!value) return '-';
  const dt = new Date(value);
  return `${fmtDate(value.slice(0, 10) === value ? value : `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`)}, ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const monthISO = () => todayISO().slice(0, 7);

// 'in_progress' -> 'In progress'
export const label = (s) => {
  if (!s) return '-';
  const t = String(s).replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'];

export const bedLabel = (a) => (a && a.room_number ? `${a.hostel_name} / Room ${a.room_number} / Bed ${a.bed_number}` : 'Not allocated');

// Downloads an array of objects as a CSV file
export const downloadCSV = (filename, rows) => {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
