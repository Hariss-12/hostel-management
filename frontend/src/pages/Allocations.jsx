import { useMemo, useState } from 'react';
import { Plus, ArrowLeftRight, LogOut } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../api/client';
import useFetch from '../hooks/useFetch';
import useForm from '../hooks/useForm';
import { useUI } from '../context/UIContext';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { Input, Select } from '../components/FormControls';
import { fmtDate, money, todayISO } from '../utils/format';

export default function Allocations() {
  const { toast, confirm } = useUI();
  const alloc = useFetch('/allocations');
  const students = useFetch('/students');
  const hostels = useFetch('/hostels');
  const [mode, setMode] = useState(null); // 'allocate' | { transfer: row }
  const [hostelId, setHostelId] = useState('');
  const beds = useFetch('/beds/available', { hostel_id: hostelId || undefined }, !!mode);
  const [saving, setSaving] = useState(false);
  const form = useForm({ student_id: '', bed_id: '', start_date: todayISO(), remarks: '' }, { bed_id: { required: true, label: 'a bed' } });

  const unallocated = useMemo(() => (students.data || []).filter((s) => s.status === 'active' && !s.hostel_name), [students.data]);
  const transferring = mode && mode.transfer;

  const open = (m) => {
    form.reset({ student_id: '', bed_id: '', start_date: todayISO(), remarks: '' });
    setHostelId('');
    setMode(m);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.validate((v) => ({ student_id: !transferring && !v.student_id ? 'Choose a student' : '' }))) return;
    setSaving(true);
    try {
      if (transferring) await api.post(`/allocations/${mode.transfer.id}/transfer`, { new_bed_id: form.values.bed_id, remarks: form.values.remarks });
      else await api.post('/allocations', form.values);
      toast.success(transferring ? 'Student transferred' : 'Bed allocated');
      setMode(null);
      alloc.reload();
      students.reload();
    } catch (err) {
      const fe = fieldErrors(err);
      form.setErrors({ ...fe, bed_id: fe.bed_id || fe.new_bed_id });
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const vacate = async (a) => {
    if (!(await confirm({ title: 'Vacate room', message: `End ${a.student_name}'s stay in ${a.hostel_name}, room ${a.room_number}, bed ${a.bed_number}?`, confirmText: 'Vacate', danger: true }))) return;
    try {
      await api.post(`/allocations/${a.id}/vacate`, {});
      toast.success('Room vacated');
      alloc.reload();
      students.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const columns = [
    { key: 'student_name', header: 'Student', sortable: true, render: (a) => <><strong>{a.student_name}</strong><span className="cell-sub">{a.roll_number}</span></> },
    { key: 'hostel_name', header: 'Hostel', sortable: true },
    { key: 'room_number', header: 'Room / bed', render: (a) => `Room ${a.room_number}, bed ${a.bed_number}` },
    { key: 'start_date', header: 'From', sortable: true, render: (a) => fmtDate(a.start_date) },
    { key: 'end_date', header: 'To', render: (a) => fmtDate(a.end_date) },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge value={a.status} /> },
    { key: 'actions', header: '', className: 'right', render: (a) => a.status === 'active' && (
      <div className="row-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => open({ transfer: a })}><ArrowLeftRight size={15} /> Transfer</button>
        <button className="btn btn-ghost btn-sm" onClick={() => vacate(a)}><LogOut size={15} /> Vacate</button>
      </div>
    ) },
  ];

  const bind = (n) => ({ name: n, value: form.values[n], onChange: form.handleChange, error: form.errors[n] });
  const bedOptions = (beds.data || []).filter((b) => !transferring || b.id !== mode.transfer.bed_id).map((b) => ({
    value: String(b.id), label: `${b.hostel_name} / Room ${b.room_number} / Bed ${b.bed_number} (${money(b.monthly_fee)}/month)`,
  }));

  return (
    <>
      <PageHeader title="Room allocations" subtitle="Give students a bed, move them, or end their stay."
        actions={<button className="btn btn-primary" onClick={() => open('allocate')}><Plus size={16} /> Allocate bed</button>} />
      {alloc.error ? <div className="form-error">{alloc.error}</div> : (
        <DataTable columns={columns} rows={alloc.data || []} loading={alloc.loading} searchKeys={['student_name', 'roll_number', 'hostel_name', 'room_number']}
          filters={[{ key: 'status', label: 'All statuses', options: ['active', 'transferred', 'vacated'] }, { key: 'hostel_name', label: 'All hostels', options: (hostels.data || []).map((h) => h.name) }]}
          empty="No allocations yet." />
      )}

      {mode && (
        <Modal title={transferring ? `Transfer ${mode.transfer.student_name}` : 'Allocate bed'} onClose={() => setMode(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setMode(null)}>Cancel</button><button className="btn btn-primary" form="alloc-form" disabled={saving}>{saving ? 'Saving...' : transferring ? 'Transfer' : 'Allocate'}</button></>}>
          <form id="alloc-form" className="form-grid" onSubmit={submit} noValidate>
            {transferring ? (
              <p className="span-2 muted-text">Currently in {mode.transfer.hostel_name}, room {mode.transfer.room_number}, bed {mode.transfer.bed_number}.</p>
            ) : (
              <Select className="span-2" label="Student" required placeholder={unallocated.length ? 'Select a student' : 'Every active student already has a bed'} options={unallocated.map((s) => ({ value: String(s.id), label: `${s.name} (${s.roll_number})` }))} {...bind('student_id')} />
            )}
            <Select className="span-2" label="Hostel" placeholder="All hostels" options={(hostels.data || []).map((h) => ({ value: String(h.id), label: h.name }))} value={hostelId} onChange={(e) => { setHostelId(e.target.value); form.setValue('bed_id', ''); }} />
            <Select className="span-2" label={transferring ? 'New bed' : 'Bed'} required placeholder={beds.loading ? 'Loading beds...' : bedOptions.length ? 'Select a free bed' : 'No free beds available'} options={bedOptions} {...bind('bed_id')} />
            {!transferring && <Input label="Start date" type="date" {...bind('start_date')} />}
            <Input className={transferring ? 'span-2' : ''} label="Remarks" {...bind('remarks')} />
          </form>
        </Modal>
      )}
    </>
  );
}
