import { Link } from 'react-router-dom';

export default function StatCard({ label, value, hint, icon: Icon, tone = 'default', to }) {
  const body = (
    <>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {Icon && <span className="stat-icon"><Icon size={18} /></span>}
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </>
  );
  return to ? <Link to={to} className={`stat stat-${tone} stat-link`}>{body}</Link> : <div className={`stat stat-${tone}`}>{body}</div>;
}
