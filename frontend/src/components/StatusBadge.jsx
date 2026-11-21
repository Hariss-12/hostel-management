import { label } from '../utils/format';

const TONES = {
  ok: ['paid', 'approved', 'present', 'resolved', 'active', 'available', 'success', 'operational'],
  warn: ['pending', 'partial', 'late', 'medium', 'maintenance'],
  danger: ['overdue', 'rejected', 'absent', 'high', 'open'],
  info: ['in_progress', 'assigned', 'on_leave', 'transferred'],
  muted: ['closed', 'cancelled', 'inactive', 'alumni', 'vacated', 'low', 'occupied'],
};

export default function StatusBadge({ value, text }) {
  const tone = Object.keys(TONES).find((t) => TONES[t].includes(value)) || 'muted';
  return <span className={`badge badge-${tone}`}>{text || label(value)}</span>;
}
