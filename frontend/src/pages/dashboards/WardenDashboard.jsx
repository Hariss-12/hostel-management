import { Link } from 'react-router-dom';
import { Users, BedDouble, CalendarCheck, CalendarDays, Wrench, AlertCircle } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ProgressBar from '../../components/ProgressBar';
import StatusBadge from '../../components/StatusBadge';
import { Loader, ErrorState } from '../../components/State';
import { fmtDate } from '../../utils/format';

export default function WardenDashboard() {
  const { data: d, loading, error, reload } = useFetch('/dashboard');
  if (loading) return <Loader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const a = d.attendance_today;
  const marked = a.present + a.absent + a.late + a.on_leave;
  const markedPct = a.total ? Math.round((marked / a.total) * 100) : 0;
  const occ = d.beds.total_beds ? Math.round((d.beds.occupied_beds / d.beds.total_beds) * 100) : 0;

  return (
    <>
      <PageHeader title="Today at the hostel" subtitle="Attendance, requests and repairs that need a decision." />

      <div className="grid grid-stats">
        <StatCard label="Active students" value={d.students} icon={Users} to="/students" />
        <StatCard label="Occupancy" value={`${occ}%`} hint={`${d.beds.occupied_beds} of ${d.beds.total_beds} beds`} icon={BedDouble} tone="brass" to="/allocations" />
        <StatCard label="Present today" value={`${a.present + a.late} / ${a.total}`} hint={`${a.absent} absent, ${a.on_leave} on leave`} icon={CalendarCheck} tone="ok" to="/attendance" />
        <StatCard label="Overdue fees" value={d.fees.overdue_fees} hint="fees past their due date" icon={AlertCircle} tone={d.fees.overdue_fees ? 'danger' : 'default'} to="/fees" />
      </div>

      <div className="grid grid-2">
        <section className="card panel">
          <div className="panel-head"><h3>Attendance today</h3><Link to="/attendance">{markedPct === 100 ? 'Review' : 'Mark attendance'}</Link></div>
          <ProgressBar value={markedPct} tone="ok" label="Attendance marked" />
          <p className="muted-text" style={{ marginTop: 10 }}>
            {a.total === 0 ? 'No students have a bed yet.' : `${marked} of ${a.total} students marked (${markedPct}%).`}
          </p>
        </section>

        <section className="card panel">
          <div className="panel-head"><h3>Pending leave requests</h3><Link to="/leaves">Review all</Link></div>
          <div className="list">
            {d.pending_leaves.length === 0 && <div className="list-empty">No requests waiting.</div>}
            {d.pending_leaves.map((l) => (
              <div className="list-row" key={l.id}>
                <div><strong>{l.student_name}</strong><small>{fmtDate(l.from_date)} to {fmtDate(l.to_date)}, {l.destination}</small></div>
                <StatusBadge value="pending" />
              </div>
            ))}
          </div>
        </section>

        <section className="card panel">
          <div className="panel-head"><h3>Complaints to assign</h3><Link to="/complaints">Open board</Link></div>
          <div className="list">
            {d.unassigned_complaints.length === 0 && <div className="list-empty">Every complaint has an owner.</div>}
            {d.unassigned_complaints.map((c) => (
              <div className="list-row" key={c.id}>
                <div><strong>{c.title}</strong><small>{c.student_name}{c.location ? ` / ${c.location}` : ''}</small></div>
                <StatusBadge value={c.priority} />
              </div>
            ))}
          </div>
        </section>

        <section className="card panel">
          <div className="panel-head"><h3>Complaint status</h3></div>
          <div className="list">
            {[['open', 'Open'], ['assigned', 'Assigned'], ['in_progress', 'In progress'], ['resolved', 'Resolved']].map(([k, name]) => (
              <div className="list-row" key={k}><span>{name}</span><strong>{d.complaints[k]}</strong></div>
            ))}
          </div>
          <Link className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} to="/complaints"><Wrench size={15} /> Manage complaints</Link>
          <Link className="btn btn-ghost btn-sm" style={{ marginTop: 12, marginLeft: 8 }} to="/leaves"><CalendarDays size={15} /> Leave requests</Link>
        </section>
      </div>
    </>
  );
}
