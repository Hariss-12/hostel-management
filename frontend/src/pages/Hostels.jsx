import { useState } from 'react';
import { Plus, Pencil, Trash2, BedDouble } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../api/client';
import useFetch from '../hooks/useFetch';
import useForm from '../hooks/useForm';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Tabs from '../components/Tabs';
import ProgressBar from '../components/ProgressBar';
import StatusBadge from '../components/StatusBadge';
import { Loader } from '../components/State';
import { Input, Select } from '../components/FormControls';
import { money, label } from '../utils/format';

const HOSTEL_EMPTY = { name: '', type: 'boys', address: '', warden_id: '' };
const ROOM_EMPTY = { hostel_id: '', room_number: '', floor: '0', room_type: 'double', capacity: '2', monthly_fee: '' };

export default function Hostels() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const { toast, confirm } = useUI();
  const [tab, setTab] = useState('hostels');
  const hostels = useFetch('/hostels');
  const rooms = useFetch('/rooms');
  const wardens = useFetch('/staff', { role: 'warden' });

  const [hostelEdit, setHostelEdit] = useState(null);
  const [roomEdit, setRoomEdit] = useState(null);
  const [bedsOf, setBedsOf] = useState(null);
  const [saving, setSaving] = useState(false);
  const hostelForm = useForm(HOSTEL_EMPTY, { name: { required: true, maxLength: 100, label: 'the hostel name' } });
  const roomForm = useForm(ROOM_EMPTY, {
    hostel_id: { required: true, label: 'a hostel' },
    room_number: { required: true, maxLength: 20, label: 'the room number' },
    floor: { required: true, type: 'int', min: 0, max: 50 },
    capacity: { required: true, type: 'int', min: 1, max: 12 },
    monthly_fee: { required: true, type: 'number', min: 0, label: 'the monthly fee' },
  });

  const refreshAll = () => { hostels.reload(); rooms.reload(); };

  const save = async (form, request, done) => {
    if (!form.validate()) return;
    setSaving(true);
    try {
      await request();
      done();
      refreshAll();
    } catch (err) {
      form.setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openHostel = (h) => {
    hostelForm.reset(h === 'new' ? HOSTEL_EMPTY : { name: h.name, type: h.type, address: h.address || '', warden_id: h.warden_id ? String(h.warden_id) : '' });
    setHostelEdit(h);
  };
  const submitHostel = (e) => {
    e.preventDefault();
    const isNew = hostelEdit === 'new';
    save(hostelForm, () => (isNew ? api.post('/hostels', hostelForm.values) : api.put(`/hostels/${hostelEdit.id}`, hostelForm.values)),
      () => { toast.success(isNew ? 'Hostel added' : 'Hostel updated'); setHostelEdit(null); });
  };

  const openRoom = (r) => {
    roomForm.reset(r === 'new' ? ROOM_EMPTY : { hostel_id: String(r.hostel_id), room_number: r.room_number, floor: String(r.floor), room_type: r.room_type, capacity: String(r.capacity), monthly_fee: String(r.monthly_fee) });
    setRoomEdit(r);
  };
  const submitRoom = (e) => {
    e.preventDefault();
    const isNew = roomEdit === 'new';
    save(roomForm, () => (isNew ? api.post('/rooms', roomForm.values) : api.put(`/rooms/${roomEdit.id}`, roomForm.values)),
      () => { toast.success(isNew ? 'Room added with its beds' : 'Room updated'); setRoomEdit(null); });
  };

  const removeItem = async (url, title, message) => {
    if (!(await confirm({ title, message, confirmText: 'Delete' }))) return;
    try {
      await api.delete(url);
      toast.success('Deleted');
      refreshAll();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const hostelCols = [
    { key: 'name', header: 'Hostel', sortable: true, render: (h) => <><strong>{h.name}</strong><span className="cell-sub">{h.address || 'No address'}</span></> },
    { key: 'type', header: 'Type', render: (h) => label(h.type) },
    { key: 'warden_name', header: 'Warden', render: (h) => h.warden_name || <span className="muted-text">Not assigned</span> },
    { key: 'room_count', header: 'Rooms', sortable: true },
    { key: 'occupied', header: 'Occupancy', render: (h) => (
      <div style={{ minWidth: 140 }}><ProgressBar value={h.bed_count ? (h.occupied / h.bed_count) * 100 : 0} label="Occupancy" /><span className="cell-sub">{h.occupied} of {h.bed_count} beds</span></div>
    ) },
    ...(isAdmin ? [{ key: 'actions', header: '', className: 'right', render: (h) => (
      <div className="row-actions">
        <button className="icon-btn" title="Edit" onClick={() => openHostel(h)}><Pencil size={16} /></button>
        <button className="icon-btn" title="Delete" onClick={() => removeItem(`/hostels/${h.id}`, 'Delete hostel', `Delete ${h.name} with all its rooms and beds? Hostels with allocation history cannot be deleted.`)}><Trash2 size={16} /></button>
      </div>
    ) }] : []),
  ];

  const roomCols = [
    { key: 'room_number', header: 'Room', sortable: true, render: (r) => <><strong>{r.room_number}</strong><span className="cell-sub">{r.hostel_name}, floor {r.floor}</span></> },
    { key: 'room_type', header: 'Type', render: (r) => label(r.room_type) },
    { key: 'capacity', header: 'Beds', render: (r) => `${r.occupied} / ${r.usable_beds} occupied` },
    { key: 'monthly_fee', header: 'Monthly fee', sortable: true, render: (r) => money(r.monthly_fee) },
    { key: 'actions', header: '', className: 'right', render: (r) => (
      <div className="row-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => setBedsOf(r)}><BedDouble size={15} /> Beds</button>
        <button className="icon-btn" title="Edit" onClick={() => openRoom(r)}><Pencil size={16} /></button>
        <button className="icon-btn" title="Delete" onClick={() => removeItem(`/rooms/${r.id}`, 'Delete room', `Delete room ${r.room_number} and its beds? Rooms with allocation history cannot be deleted.`)}><Trash2 size={16} /></button>
      </div>
    ) },
  ];

  const hb = (n) => ({ name: n, value: hostelForm.values[n], onChange: hostelForm.handleChange, error: hostelForm.errors[n] });
  const rb = (n) => ({ name: n, value: roomForm.values[n], onChange: roomForm.handleChange, error: roomForm.errors[n] });
  const hostelOptions = (hostels.data || []).map((h) => ({ value: String(h.id), label: h.name }));

  return (
    <>
      <PageHeader title="Hostels & rooms" subtitle="Buildings, rooms and the beds inside them."
        actions={tab === 'hostels'
          ? isAdmin && <button className="btn btn-primary" onClick={() => openHostel('new')}><Plus size={16} /> Add hostel</button>
          : <button className="btn btn-primary" onClick={() => openRoom('new')} disabled={!hostelOptions.length}><Plus size={16} /> Add room</button>} />
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'hostels', label: 'Hostels' }, { key: 'rooms', label: 'Rooms' }]} />

      {tab === 'hostels' && (hostels.error ? <div className="form-error">{hostels.error}</div> : (
        <DataTable columns={hostelCols} rows={hostels.data || []} loading={hostels.loading} searchKeys={['name', 'address', 'warden_name']}
          filters={[{ key: 'type', label: 'All types', options: ['boys', 'girls', 'mixed'] }]} empty={isAdmin ? 'No hostels yet. Add your first hostel.' : 'No hostels have been set up yet.'} />
      ))}

      {tab === 'rooms' && (rooms.error ? <div className="form-error">{rooms.error}</div> : (
        <DataTable columns={roomCols} rows={rooms.data || []} loading={rooms.loading} searchKeys={['room_number', 'hostel_name']}
          filters={[{ key: 'hostel_name', label: 'All hostels', options: (hostels.data || []).map((h) => h.name) }, { key: 'room_type', label: 'All room types', options: ['single', 'double', 'triple', 'dormitory'] }]}
          empty="No rooms yet. Add a room to create its beds." />
      ))}

      {hostelEdit && (
        <Modal title={hostelEdit === 'new' ? 'Add hostel' : `Edit ${hostelEdit.name}`} onClose={() => setHostelEdit(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setHostelEdit(null)}>Cancel</button><button className="btn btn-primary" form="hostel-form" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}>
          <form id="hostel-form" className="form-grid" onSubmit={submitHostel} noValidate>
            <Input label="Hostel name" required {...hb('name')} />
            <Select label="Type" required options={['boys', 'girls', 'mixed'].map((t) => ({ value: t, label: label(t) }))} {...hb('type')} />
            <Input className="span-2" label="Address" {...hb('address')} />
            <Select className="span-2" label="Warden" placeholder="Not assigned" options={(wardens.data || []).map((w) => ({ value: String(w.id), label: w.name }))} {...hb('warden_id')} />
          </form>
        </Modal>
      )}

      {roomEdit && (
        <Modal title={roomEdit === 'new' ? 'Add room' : `Edit room ${roomEdit.room_number}`} onClose={() => setRoomEdit(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setRoomEdit(null)}>Cancel</button><button className="btn btn-primary" form="room-form" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}>
          <form id="room-form" className="form-grid" onSubmit={submitRoom} noValidate>
            <Select className="span-2" label="Hostel" required placeholder="Select a hostel" options={hostelOptions} {...rb('hostel_id')} />
            <Input label="Room number" required {...rb('room_number')} />
            <Input label="Floor" type="number" min="0" required {...rb('floor')} />
            <Select label="Room type" required options={['single', 'double', 'triple', 'dormitory'].map((t) => ({ value: t, label: label(t) }))} {...rb('room_type')} />
            <Input label="Capacity (beds)" type="number" min="1" max="12" required hint="One bed is created for each place." {...rb('capacity')} />
            <Input className="span-2" label="Monthly fee (INR)" type="number" min="0" step="0.01" required {...rb('monthly_fee')} />
          </form>
        </Modal>
      )}

      {bedsOf && <BedsModal room={bedsOf} onClose={() => { setBedsOf(null); refreshAll(); }} />}
    </>
  );
}

function BedsModal({ room, onClose }) {
  const { toast } = useUI();
  const { data, loading, reload } = useFetch(`/rooms/${room.id}/beds`);

  const toggle = async (bed) => {
    try {
      await api.put(`/beds/${bed.id}`, { is_usable: !bed.is_usable });
      toast.success(bed.is_usable ? 'Bed marked under maintenance' : 'Bed is available again');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const cols = [
    { key: 'bed_number', header: 'Bed', render: (b) => `Bed ${b.bed_number}` },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge value={!b.is_usable ? 'maintenance' : b.student_id ? 'occupied' : 'available'} text={!b.is_usable ? 'Under maintenance' : undefined} /> },
    { key: 'student_name', header: 'Student', render: (b) => (b.student_name ? `${b.student_name} (${b.roll_number})` : '-') },
    { key: 'actions', header: '', className: 'right', render: (b) => (
      <button className="btn btn-ghost btn-sm" onClick={() => toggle(b)} disabled={!!b.student_id}>{b.is_usable ? 'Mark under maintenance' : 'Make available'}</button>
    ) },
  ];

  return (
    <Modal title={`${room.hostel_name} / Room ${room.room_number}`} size="lg" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      {loading ? <Loader /> : (
        <div className="card table-card"><div className="table-wrap"><table>
          <thead><tr>{cols.map((c) => <th key={c.key} className={c.className}>{c.header}</th>)}</tr></thead>
          <tbody>{(data || []).map((b) => <tr key={b.id}>{cols.map((c) => <td key={c.key} className={c.className}>{c.render(b)}</td>)}</tr>)}</tbody>
        </table></div></div>
      )}
    </Modal>
  );
}
