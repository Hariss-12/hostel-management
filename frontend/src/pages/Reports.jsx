import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import useFetch from '../hooks/useFetch';
import PageHeader from '../components/PageHeader';
import Tabs from '../components/Tabs';
import DataTable from '../components/DataTable';
import StatCard from '../components/StatCard';
import { ErrorState } from '../components/State';
import { Select } from '../components/FormControls';
import { money, fmtDate, label, downloadCSV, monthISO } from '../utils/format';

const TABS = [
  { key: 'occupancy', label: 'Occupancy' },
  { key: 'fees', label: 'Fees' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'complaints', label: 'Complaints' },
];
const MONEY = ['billed', 'paid', 'balance'];
const DATES = ['raised_on'];

export default function Reports() {
  const [tab, setTab] = useState('occupancy');
  const [hostelId, setHostelId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [month, setMonth] = useState(monthISO());
  const hostels = useFetch('/hostels');

  const params = useMemo(() => {
    const p = {};
    if (['occupancy', 'fees', 'attendance'].includes(tab) && hostelId) p.hostel_id = hostelId;
    if (['fees', 'complaints'].includes(tab)) { if (from) p.from = from; if (to) p.to = to; }
    if (tab === 'attendance') p.month = month;
    return p;
  }, [tab, hostelId, from, to, month]);

  const { data, loading, error, reload } = useFetch(`/reports/${tab}`, params);
  const rows = (data?.rows || []).map((r, i) => ({ ...r, _id: i }));

  const columns = rows.length
    ? Object.keys(rows[0]).filter((k) => k !== '_id' && k !== 'id').map((k) => ({
        key: k, header: label(k), sortable: true,
        render: (r) => (MONEY.includes(k) ? money(r[k]) : DATES.includes(k) ? fmtDate(r[k]) : k === 'percentage' ? (r[k] === null ? '-' : `${r[k]}%`) : ['status', 'priority', 'category', 'room_type'].includes(k) ? label(r[k]) : r[k] === null || r[k] === '' ? '-' : r[k]),
      }))
    : [];

  const exportCsv = () => downloadCSV(`${tab}-report.csv`, rows.map(({ _id, ...r }) => Object.fromEntries(Object.entries(r).map(([k, v]) => [label(k), v]))));
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);

  return (
    <>
      <PageHeader title="Reports" subtitle="Summaries you can filter and export as CSV."
        actions={<button className="btn btn-ghost" onClick={exportCsv} disabled={!rows.length}><Download size={16} /> Export CSV</button>} />
      <Tabs active={tab} onChange={setTab} tabs={TABS} />

      <div className="card panel" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          {tab !== 'complaints' && <Select label="Hostel" placeholder="All hostels" options={(hostels.data || []).map((h) => ({ value: String(h.id), label: h.name }))} value={hostelId} onChange={(e) => setHostelId(e.target.value)} />}
          {tab === 'attendance' && <label className="field"><span className="field-label">Month</span><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>}
          {(tab === 'fees' || tab === 'complaints') && <>
            <label className="field"><span className="field-label">{tab === 'fees' ? 'Due from' : 'Raised from'}</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="field"><span className="field-label">{tab === 'fees' ? 'Due until' : 'Raised until'}</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </>}
        </div>
      </div>

      {tab === 'occupancy' && rows.length > 0 && (
        <div className="grid grid-stats"><StatCard label="Beds" value={sum('beds')} /><StatCard label="Occupied" value={sum('occupied')} tone="brass" /><StatCard label="Vacant" value={sum('vacant')} tone="ok" /></div>
      )}
      {tab === 'fees' && rows.length > 0 && (
        <div className="grid grid-stats"><StatCard label="Billed" value={money(sum('billed'))} /><StatCard label="Collected" value={money(sum('paid'))} tone="ok" /><StatCard label="Outstanding" value={money(sum('balance'))} tone={sum('balance') ? 'danger' : 'default'} /></div>
      )}

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable columns={columns.length ? columns : [{ key: 'none', header: 'Report' }]} rows={rows} rowKey="_id" loading={loading} pageSize={15}
          searchKeys={rows.length ? Object.keys(rows[0]).filter((k) => typeof rows[0][k] === 'string') : []} empty="No data for the selected filters." />
      )}
    </>
  );
}
