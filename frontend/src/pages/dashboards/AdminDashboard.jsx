import { Link } from 'react-router-dom';
import { Users, BedDouble, Wallet, AlertCircle, Wrench, CalendarDays, UserCog, Building2, Plus } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ProgressBar from '../../components/ProgressBar';
import StatusBadge from '../../components/StatusBadge';
import { Loader, ErrorState } from '../../components/State';
import { money, fmtDate } from '../../utils/format';

export default function AdminDashboard() {
  const { data: d, loading, error, reload } = useFetch('/dashboard');
  if (loading) return <Loader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const occ = pct(d.beds.occupied_beds, d.beds.total_beds);
  const openComplaints = d.complaints.open + d.complaints.assigned + d.complaints.in_progress;
  const maxMonth = Math.max(1, ...d.monthly_collections.map((m) => m.total));

  return (
    <>
      <PageHeader title="Administration overview" subtitle="Occupancy, collections and open work across all hostels." />

      <div className="grid grid-stats">
        <StatCard label="Active students" value={d.counts.students} hint={`${d.counts.hostels} hostels, ${d.counts.rooms} rooms`} icon={Users} to="/students" />
        <StatCard label="Beds occupied" value={`${d.beds.occupied_beds} / ${d.beds.total_beds}`} hint={`${occ}% occupancy`} icon={BedDouble} tone="brass" to="/allocations" />
        <StatCard label="Fees collected" value={money(d.fees.collected)} hint={`${money(d.fees.collected_this_month)} this month`} icon={Wallet} tone="ok" to="/fees" />
        <StatCard label="Outstanding fees" value={money(d.fees.outstanding)} hint={`${d.fees.overdue_fees} overdue`} icon={AlertCircle} tone={d.fees.outstanding > 0 ? 'danger' : 'default'} to="/fees" />
      </div>
      <div className="grid grid-stats">
        <StatCard label="Open complaints" value={openComplaints} hint={`${d.complaints.open} not yet assigned`} icon={Wrench} tone="info" to="/complaints" />
        <StatCard label="Pending leave requests" value={d.pending_leaves} icon={CalendarDays} to="/leaves" />
        <StatCard label="Wardens" value={d.counts.wardens} icon={UserCog} to="/staff" />
        <StatCard label="Maintenance staff" value={d.counts.maintenance} icon={Building2} to="/staff" />
      </div>

      <div className="grid grid-main">
        <div className="stack">
          <section className="card panel">
            <div className="panel-head"><h3>Occupancy by hostel</h3><Link to="/hostels">Manage</Link></div>
            {d.by_hostel.length === 0 && <div className="list-empty">No hostels yet. <Link to="/hostels">Add the first hostel</Link>.</div>}
            {d.by_hostel.map((h) => {
              const p = pct(h.occupied, h.beds);
              return (
                <div className="hbar" key={h.id}>
                  <span className="hbar-name" title={h.name}>{h.name}</span>
                  <ProgressBar value={p} tone={p > 90 ? 'danger' : 'brass'} label={`${h.name} occupancy`} />
                  <span className="hbar-val">{h.occupied}/{h.beds}</span>
                </div>
              );
            })}
          </section>

          <section className="card panel">
            <div className="panel-head"><h3>Fee collection, last 6 months</h3></div>
            <div className="col-chart">
              {d.monthly_collections.map((m, i) => (
                <div className="col" key={`${m.label}-${i}`}>
                  <span className="col-val">{m.total ? money(m.total).replace('.00', '') : ''}</span>
                  <div className={`col-bar ${i === d.monthly_collections.length - 1 ? 'current' : ''}`} style={{ height: `${(m.total / maxMonth) * 100}%` }} />
                  <span className="col-lab">{m.label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card panel">
            <div className="panel-head"><h3>Quick actions</h3></div>
            <div className="quick">
              <Link to="/students"><Plus size={16} /> Register student</Link>
              <Link to="/allocations"><BedDouble size={16} /> Allocate bed</Link>
              <Link to="/fees"><Wallet size={16} /> Record payment</Link>
              <Link to="/staff"><UserCog size={16} /> Add staff</Link>
            </div>
          </section>

          <section className="card panel">
            <div className="panel-head"><h3>Open complaints</h3><Link to="/complaints">View all</Link></div>
            <div className="list">
              {d.recent_complaints.length === 0 && <div className="list-empty">Nothing open right now.</div>}
              {d.recent_complaints.map((c) => (
                <div className="list-row" key={c.id}>
                  <div><strong>{c.title}</strong><small>{c.student_name} / {fmtDate(c.created_at)}</small></div>
                  <StatusBadge value={c.priority} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
