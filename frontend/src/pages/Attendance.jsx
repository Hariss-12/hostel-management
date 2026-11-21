import { useEffect, useMemo, useState } from 'react';
import { Save, CheckCheck } from 'lucide-react';
import api, { errorMessage } from '../api/client';
import useFetch from '../hooks/useFetch';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { Loader, ErrorState } from '../components/State';
import { Select } from '../components/FormControls';
import { todayISO, monthISO, label, fmtDate } from '../utils/format';
import { CalendarCheck, XCircle, Clock, Plane } from 'lucide-react';

export default function Attendance() {
  const { user } = useAuth();
  return user.role === 'student' ? <StudentAttendance studentId={user.student_id} /> : <StaffAttendance />;
}

const STATUSES = ['present', 'absent', 'late', 'on_leave'];

/* ------------------------------ Staff: mark ------------------------------ */
function StaffAttendance() {
  const { toast } = useUI();
  const [date, setDate] = useState(todayISO());
  const [hostelId, setHostelId] = useState('');
  const hostels = useFetch('/hostels');
  const { data, loading, error, reload } = useFetch('/attendance', { date, hostel_id: hostelId || undefined });
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);

  // Start from saved values; students on approved leave default to "on leave"
  useEffect(() => {
    if (!data) return;
    const m = {};
    data.students.forEach((s) => { m[s.student_id] = s.status || (s.on_leave ? 'on_leave' : ''); });
    setMarks(m);
  }, [data]);

  const rows = useMemo(() => (data ? data.students.map((s) => ({ ...s, id: s.student_id })) : []), [data]);
  const counts = STATUSES.reduce((acc, k) => ({ ...acc, [k]: Object.values(marks).filter((v) => v === k).length }), {});
  const unmarked = rows.length - Object.values(marks).filter(Boolean).length;

  const setMark = (id, status) => setMarks((m) => ({ ...m, [id]: status }));
  const markAllPresent = () => setMarks((m) => {
    const next = { ...m };
    rows.forEach((r) => { if (!next[r.id] || next[r.id] === 'present') next[r.id] = 'present'; });
    return next;
  });

  const save = async () => {
    const records = rows.filter((r) => marks[r.id]).map((r) => ({ student_id: r.id, status: marks[r.id] }));
    if (!records.length) return toast.error('Mark at least one student first');
    setSaving(true);
    try {
      await api.post('/attendance/bulk', { date, records });
      toast.success(`Attendance saved for ${records.length} student${records.length === 1 ? '' : 's'}`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'name', header: 'Student', sortable: true, render: (r) => <><strong>{r.name}</strong><span className="cell-sub">{r.roll_number}{r.on_leave ? ' / approved leave today' : ''}</span></> },
    { key: 'hostel_name', header: 'Room', render: (r) => `${r.hostel_name}, ${r.room_number}` },
    { key: 'mark', header: 'Attendance', render: (r) => (
      <div className="segmented" role="group" aria-label={`Attendance for ${r.name}`}>
        {STATUSES.map((s) => (
          <button key={s} type="button" className={`seg ${marks[r.id] === s ? `on-${s}` : ''}`} onClick={() => setMark(r.id, s)} aria-pressed={marks[r.id] === s}>{s === 'on_leave' ? 'Leave' : label(s)}</button>
        ))}
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader title="Attendance" subtitle="Mark the daily roll call for students who have a bed."
        actions={<>
          <button className="btn btn-ghost" onClick={markAllPresent} disabled={!rows.length}><CheckCheck size={16} /> Mark all present</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !rows.length}><Save size={16} /> {saving ? 'Saving...' : 'Save attendance'}</button>
        </>} />

      <div className="card panel" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <label className="field"><span className="field-label">Date</span><input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
          <Select label="Hostel" placeholder="All hostels" options={(hostels.data || []).map((h) => ({ value: String(h.id), label: h.name }))} value={hostelId} onChange={(e) => setHostelId(e.target.value)} />
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <div className="card">
          <div className="att-bar">
            <span><b>{counts.present}</b> present</span><span><b>{counts.late}</b> late</span><span><b>{counts.absent}</b> absent</span>
            <span><b>{counts.on_leave}</b> on leave</span><span><b>{unmarked}</b> not marked</span>
          </div>
          <DataTable columns={columns} rows={rows} loading={loading} searchKeys={['name', 'roll_number', 'room_number']} pageSize={25} empty="No students have been allocated a bed yet." />
        </div>
      )}
    </>
  );
}

/* ---------------------------- Student: my month ---------------------------- */
function StudentAttendance({ studentId }) {
  const [month, setMonth] = useState(monthISO());
  const { data, loading, error, reload } = useFetch(`/attendance/student/${studentId}`, { month });

  const days = useMemo(() => {
    if (!data) return [];
    const [y, m] = month.split('-').map(Number);
    const byDay = {};
    data.records.forEach((r) => { byDay[Number(r.attendance_date.slice(8, 10))] = r; });
    const blanks = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const total = new Date(y, m, 0).getDate();
    return [...Array(blanks).fill(null), ...Array.from({ length: total }, (_, i) => ({ day: i + 1, rec: byDay[i + 1] }))];
  }, [data, month]);

  const s = data?.summary;

  return (
    <>
      <PageHeader title="My attendance" subtitle="Your roll-call record for the month."
        actions={<input type="month" value={month} max={monthISO()} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />} />
      {loading && <Loader />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {s && (
        <>
          <div className="grid grid-stats">
            <StatCard label="Attendance" value={s.percentage === null ? '-' : `${s.percentage}%`} hint="present and late days" icon={CalendarCheck} tone="ok" />
            <StatCard label="Present" value={s.present} icon={CalendarCheck} />
            <StatCard label="Late" value={s.late} icon={Clock} tone="brass" />
            <StatCard label="Absent" value={s.absent} icon={XCircle} tone={s.absent ? 'danger' : 'default'} />
            <StatCard label="On leave" value={s.on_leave} icon={Plane} tone="info" />
          </div>
          <section className="card panel">
            <div className="calendar">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div className="cal-head" key={d}>{d}</div>)}
              {days.map((d, i) => d ? (
                <div key={i} className={`cal-day ${d.rec ? `cal-${d.rec.status}` : ''}`} title={d.rec ? `${fmtDate(d.rec.attendance_date)}: ${label(d.rec.status)}` : 'Not marked'}>
                  <span>{d.day}</span>{d.rec && <small>{d.rec.status === 'on_leave' ? 'Leave' : label(d.rec.status)}</small>}
                </div>
              ) : <div key={i} className="cal-day cal-blank" />)}
            </div>
            <div className="legend">{STATUSES.map((st) => <StatusBadge key={st} value={st} />)}</div>
          </section>
        </>
      )}
    </>
  );
}
