import { Link } from 'react-router-dom';
import { Wallet, CalendarCheck, CalendarDays, Wrench, UtensilsCrossed, Plus } from 'lucide-react';
import useFetch from '../../hooks/useFetch';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { Loader, ErrorState } from '../../components/State';
import { money, fmtDate, label } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data: d, loading, error, reload } = useFetch('/dashboard');
  if (loading) return <Loader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const room = d.allocation;
  const pct = d.attendance.percentage;

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]}`} subtitle="Your room, dues and daily hostel life." />

      <section className="hero-room">
        {room ? (
          <>
            <div>
              <h2>{room.hostel_name}</h2>
              <div className="room-no">Room {room.room_number}</div>
              <p>Bed {room.bed_number}, floor {room.floor}, {room.room_type} room. Since {fmtDate(room.start_date)}.</p>
            </div>
            <Link to="/my-room" className="btn btn-ghost">Room details</Link>
          </>
        ) : (
          <div>
            <h2>Room</h2>
            <div className="room-no">Not allocated yet</div>
            <p>The hostel office will assign a bed and you will get a notification.</p>
          </div>
        )}
      </section>

      <div className="grid grid-stats">
        <StatCard label="Fees due" value={money(d.fees.balance)} hint={d.fees.next_due ? `${d.fees.next_due.title}, due ${fmtDate(d.fees.next_due.due_date)}` : 'Nothing pending'} icon={Wallet} tone={d.fees.balance > 0 ? 'danger' : 'ok'} to="/fees" />
        <StatCard label="Attendance this month" value={pct === null ? '-' : `${pct}%`} hint={pct === null ? 'No records yet' : `${d.attendance.present} present, ${d.attendance.absent} absent`} icon={CalendarCheck} tone="ok" to="/attendance" />
        <StatCard label="Leave requests" value={d.leaves.pending} hint={`${d.leaves.upcoming} approved upcoming`} icon={CalendarDays} to="/leaves" />
        <StatCard label="Open complaints" value={d.open_complaints} icon={Wrench} tone="info" to="/complaints" />
      </div>

      <div className="grid grid-2">
        <section className="card panel">
          <div className="panel-head"><h3>Today in the mess</h3><Link to="/mess">Weekly menu</Link></div>
          {d.todays_menu.length === 0 && <div className="list-empty">The menu for today has not been published.</div>}
          {d.todays_menu.map((m) => (
            <div className="meal-row" key={m.meal_type}><span>{label(m.meal_type)}</span><div>{m.items}</div></div>
          ))}
        </section>

        <section className="card panel">
          <div className="panel-head"><h3>Quick actions</h3></div>
          <div className="quick">
            <Link to="/complaints"><Plus size={16} /> Raise complaint</Link>
            <Link to="/leaves"><CalendarDays size={16} /> Apply for leave</Link>
            <Link to="/mess"><UtensilsCrossed size={16} /> Skip a meal</Link>
            <Link to="/fees"><Wallet size={16} /> Receipts</Link>
          </div>
        </section>
      </div>
    </>
  );
}
