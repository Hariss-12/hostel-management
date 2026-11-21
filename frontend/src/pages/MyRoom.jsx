import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import { Loader, ErrorState } from '../components/State';
import useFetch from '../hooks/useFetch';
import { fmtDate, money, label } from '../utils/format';

export default function MyRoom() {
  const { data, loading, error, reload } = useFetch('/allocations/mine');
  const mates = useFetch('/allocations/roommates');
  if (loading) return <Loader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const current = data.find((a) => a.status === 'active');

  return (
    <>
      <PageHeader title="My room" subtitle="Your current bed, roommates and room history." />
      {current ? (
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          <section className="card panel">
            <div className="panel-head"><h3>Current allocation</h3><StatusBadge value="active" /></div>
            <dl className="detail-grid">
              <div><dt>Hostel</dt><dd>{current.hostel_name}</dd></div>
              <div><dt>Room</dt><dd>{current.room_number} (floor {current.floor})</dd></div>
              <div><dt>Bed</dt><dd>Bed {current.bed_number}</dd></div>
              <div><dt>Room type</dt><dd>{label(current.room_type)}</dd></div>
              <div><dt>Staying since</dt><dd>{fmtDate(current.start_date)}</dd></div>
              <div><dt>Monthly fee</dt><dd>{money(current.monthly_fee)}</dd></div>
            </dl>
          </section>
          <section className="card panel">
            <div className="panel-head"><h3>Roommates</h3></div>
            <div className="list">
              {(mates.data || []).length === 0 && <div className="list-empty">No one else is in your room right now.</div>}
              {(mates.data || []).map((m) => (
                <div className="list-row" key={m.bed_number}><div><strong>{m.name}</strong><small>{m.course}, year {m.year_of_study}</small></div><span className="muted-text">Bed {m.bed_number}</span></div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="card panel" style={{ marginBottom: 16 }}>You have not been allocated a bed yet. The hostel office will notify you once one is assigned.</div>
      )}

      <DataTable
        rows={data} empty="No room history yet."
        columns={[
          { key: 'hostel_name', header: 'Hostel' },
          { key: 'room_number', header: 'Room / bed', render: (a) => `Room ${a.room_number}, bed ${a.bed_number}` },
          { key: 'start_date', header: 'From', render: (a) => fmtDate(a.start_date) },
          { key: 'end_date', header: 'To', render: (a) => fmtDate(a.end_date) },
          { key: 'status', header: 'Status', render: (a) => <StatusBadge value={a.status} /> },
        ]}
      />
    </>
  );
}
