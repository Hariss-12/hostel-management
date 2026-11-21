import { Link } from 'react-router-dom';
import { Wrench, Hammer, Flame, CheckCircle2 } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import { Loader, ErrorState } from '../../components/State';
import { fmtDate, label } from '../../utils/format';

export default function MaintenanceDashboard() {
  const { data: d, loading, error, reload } = useFetch('/dashboard');
  if (loading) return <Loader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader title="My work queue" subtitle="Complaints assigned to you, most urgent first." actions={<Link to="/complaints" className="btn btn-primary">Open task list</Link>} />

      <div className="grid grid-stats">
        <StatCard label="New assignments" value={d.counts.assigned} icon={Wrench} tone="info" to="/complaints" />
        <StatCard label="In progress" value={d.counts.in_progress} icon={Hammer} tone="brass" to="/complaints" />
        <StatCard label="High priority" value={d.counts.high_priority} icon={Flame} tone={d.counts.high_priority ? 'danger' : 'default'} to="/complaints" />
        <StatCard label="Resolved this month" value={d.counts.resolved_this_month} icon={CheckCircle2} tone="ok" />
      </div>

      <section className="card panel">
        <div className="panel-head"><h3>Tasks to work on</h3></div>
        <div className="list">
          {d.tasks.length === 0 && <div className="list-empty">You have no pending tasks.</div>}
          {d.tasks.map((t) => (
            <div className="list-row" key={t.id}>
              <div>
                <strong>{t.title}</strong>
                <small>{label(t.category)} / {t.location || 'No location'} / raised {fmtDate(t.created_at)}</small>
              </div>
              <div style={{ display: 'flex', gap: 6 }}><StatusBadge value={t.priority} /><StatusBadge value={t.status} /></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
