import { useState } from 'react';
import { Plus, Eye } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../api/client';
import useFetch from '../hooks/useFetch';
import useForm from '../hooks/useForm';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { Input, Select, TextArea } from '../components/FormControls';
import { fmtDate, fmtDateTime, label } from '../utils/format';

const CATEGORIES = ['electrical', 'plumbing', 'furniture', 'cleaning', 'internet', 'other'];
const STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];
const EMPTY = { category: 'electrical', title: '', description: '', priority: 'medium', location: '' };

export default function Complaints() {
  const { user } = useAuth();
  const role = user.role;
  const { toast } = useUI();
  const { data, loading, error, reload } = useFetch('/complaints');
  const crew = useFetch('/staff', { role: 'maintenance' }, role === 'admin' || role === 'warden');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [saving, setSaving] = useState(false);
  const form = useForm(EMPTY, {
    title: { required: true, minLength: 3, maxLength: 150, label: 'a short title' },
    description: { required: true, minLength: 5, maxLength: 1000, label: 'a description' },
    location: { maxLength: 100 },
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.validate()) return;
    setSaving(true);
    try {
      await api.post('/complaints', form.values);
      toast.success('Complaint submitted');
      setCreating(false);
      reload();
    } catch (err) {
      form.setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const selected = (data || []).find((c) => c.id === openId);
  const columns = [
    { key: 'title', header: 'Complaint', sortable: true, render: (c) => <><strong>{c.title}</strong><span className="cell-sub">{label(c.category)}{c.location ? ` / ${c.location}` : ''}</span></> },
    ...(role !== 'student' ? [{ key: 'student_name', header: 'Raised by', render: (c) => <>{c.student_name}<span className="cell-sub">{c.roll_number}</span></> }] : []),
    { key: 'priority', header: 'Priority', render: (c) => <StatusBadge value={c.priority} /> },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge value={c.status} /> },
    ...(role !== 'maintenance' ? [{ key: 'assigned_to_name', header: 'Assigned to', render: (c) => c.assigned_to_name || <span className="muted-text">Unassigned</span> }] : []),
    { key: 'created_at', header: 'Raised', sortable: true, render: (c) => fmtDate(c.created_at) },
    { key: 'actions', header: '', className: 'right', render: (c) => <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(c.id)}><Eye size={15} /> {role === 'student' ? 'View' : 'Manage'}</button> },
  ];

  const bind = (n) => ({ name: n, value: form.values[n], onChange: form.handleChange, error: form.errors[n] });

  return (
    <>
      <PageHeader title={role === 'maintenance' ? 'Assigned tasks' : 'Complaints'}
        subtitle={role === 'student' ? 'Report a problem with your room or the hostel and follow its progress.' : role === 'maintenance' ? 'Repairs assigned to you.' : 'Assign, track and close maintenance complaints.'}
        actions={role === 'student' && <button className="btn btn-primary" onClick={() => { form.reset(EMPTY); setCreating(true); }}><Plus size={16} /> Raise complaint</button>} />
      {error ? <div className="form-error">{error}</div> : (
        <DataTable columns={columns} rows={data || []} loading={loading} searchKeys={['title', 'student_name', 'location', 'roll_number']}
          filters={[{ key: 'status', label: 'All statuses', options: STATUSES }, { key: 'priority', label: 'All priorities', options: ['high', 'medium', 'low'] }, { key: 'category', label: 'All categories', options: CATEGORIES }]}
          empty={role === 'maintenance' ? 'Nothing has been assigned to you.' : 'No complaints yet.'} />
      )}

      {creating && (
        <Modal title="Raise a complaint" onClose={() => setCreating(false)}
          footer={<><button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn btn-primary" form="complaint-form" disabled={saving}>{saving ? 'Submitting...' : 'Submit'}</button></>}>
          <form id="complaint-form" className="form-grid" onSubmit={submit} noValidate>
            <Select label="Category" required options={CATEGORIES.map((c) => ({ value: c, label: label(c) }))} {...bind('category')} />
            <Select label="Priority" required options={['low', 'medium', 'high'].map((p) => ({ value: p, label: label(p) }))} {...bind('priority')} />
            <Input className="span-2" label="Title" required placeholder="e.g. Ceiling fan not working" {...bind('title')} />
            <Input className="span-2" label="Location" hint="Leave blank to use your room" {...bind('location')} />
            <TextArea className="span-2" label="Description" required rows={4} {...bind('description')} />
          </form>
        </Modal>
      )}

      {selected && <ComplaintModal c={selected} role={role} crew={crew.data || []} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}

function ComplaintModal({ c, role, crew, onClose, onChanged }) {
  const { toast, confirm } = useUI();
  const [assignTo, setAssignTo] = useState(c.assigned_to ? String(c.assigned_to) : '');
  const [status, setStatus] = useState(c.status);
  const [note, setNote] = useState(c.resolution_note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isStaff = role === 'admin' || role === 'warden';

  const run = async (fn, okMsg) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      toast.success(okMsg);
      onChanged();
    } catch (e) {
      setErr(fieldErrors(e).resolution_note || errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const setStatusTo = (s, msg = 'Status updated') => run(() => api.put(`/complaints/${c.id}/status`, { status: s, resolution_note: note }), msg);
  const assign = () => run(() => api.put(`/complaints/${c.id}/assign`, { assigned_to: assignTo }), 'Complaint assigned');
  const remove = async () => {
    if (!(await confirm({ title: 'Delete complaint', message: 'Delete this complaint?', confirmText: 'Delete' }))) return;
    try { await api.delete(`/complaints/${c.id}`); toast.success('Complaint deleted'); onChanged(); onClose(); } catch (e) { toast.error(errorMessage(e)); }
  };

  const done = ['resolved', 'closed'].includes(c.status);

  return (
    <Modal title={c.title} size="lg" onClose={onClose} footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      {err && <div className="form-error">{err}</div>}
      <dl className="detail-grid" style={{ marginBottom: 18 }}>
        <div><dt>Status</dt><dd><StatusBadge value={c.status} /></dd></div>
        <div><dt>Priority</dt><dd><StatusBadge value={c.priority} /></dd></div>
        <div><dt>Category</dt><dd>{label(c.category)}</dd></div>
        <div><dt>Location</dt><dd>{c.location || '-'}</dd></div>
        <div><dt>Raised by</dt><dd>{c.student_name} ({c.roll_number})</dd></div>
        <div><dt>Raised on</dt><dd>{fmtDateTime(c.created_at)}</dd></div>
        <div><dt>Assigned to</dt><dd>{c.assigned_to_name || 'Unassigned'}</dd></div>
        <div><dt>Resolved on</dt><dd>{c.resolved_at ? fmtDateTime(c.resolved_at) : '-'}</dd></div>
        <div className="span-2"><dt>Description</dt><dd>{c.description}</dd></div>
        {c.resolution_note && <div className="span-2"><dt>Resolution note</dt><dd>{c.resolution_note}</dd></div>}
      </dl>

      {isStaff && !done && (
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <Select label="Assign to maintenance staff" placeholder="Choose staff" options={crew.filter((s) => s.is_active).map((s) => ({ value: String(s.id), label: s.name }))} value={assignTo} onChange={(e) => setAssignTo(e.target.value)} />
          <div style={{ alignSelf: 'end' }}><button className="btn btn-primary" onClick={assign} disabled={busy || !assignTo || assignTo === String(c.assigned_to || '')}>{c.assigned_to ? 'Reassign' : 'Assign'}</button></div>
        </div>
      )}

      {isStaff && (
        <div className="form-grid">
          <Select label="Update status" options={STATUSES.map((s) => ({ value: s, label: label(s) }))} value={status} onChange={(e) => setStatus(e.target.value)} />
          <TextArea label="Resolution note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="span-2 row-actions">
            <button className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>Delete</button>
            <button className="btn btn-primary" onClick={() => setStatusTo(status)} disabled={busy || status === c.status && note === (c.resolution_note || '')}>Save status</button>
          </div>
        </div>
      )}

      {role === 'maintenance' && !done && (
        <>
          <TextArea label="Note on the work done" rows={3} value={note} onChange={(e) => setNote(e.target.value)} hint="Required when marking as resolved." />
          <div className="row-actions" style={{ marginTop: 14 }}>
            {c.status !== 'in_progress' && <button className="btn btn-ghost" onClick={() => setStatusTo('in_progress', 'Marked as in progress')} disabled={busy}>Start work</button>}
            <button className="btn btn-primary" onClick={() => setStatusTo('resolved', 'Marked as resolved')} disabled={busy}>Mark resolved</button>
          </div>
        </>
      )}

      {role === 'student' && (
        <div className="row-actions">
          {c.status === 'open' && <button className="btn btn-danger" onClick={remove}>Delete complaint</button>}
          {c.status === 'resolved' && <button className="btn btn-primary" onClick={() => setStatusTo('closed', 'Complaint closed')} disabled={busy}>Confirm fixed and close</button>}
          {done && <button className="btn btn-ghost" onClick={() => setStatusTo('open', 'Complaint reopened')} disabled={busy}>Not fixed, reopen</button>}
        </div>
      )}
    </Modal>
  );
}
