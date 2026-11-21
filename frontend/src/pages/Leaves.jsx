import { useState } from 'react';
import { Plus, Check, X } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../api/client';
import useFetch from '../hooks/useFetch';
import useForm from '../hooks/useForm';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { Input, TextArea } from '../components/FormControls';
import { fmtDate, todayISO } from '../utils/format';

const EMPTY = { from_date: todayISO(), to_date: todayISO(), destination: '', reason: '', contact_phone: '' };

export default function Leaves() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';
  const { toast, confirm } = useUI();
  const { data, loading, error, reload } = useFetch('/leaves');
  const [applying, setApplying] = useState(false);
  const [deciding, setDeciding] = useState(null); // { leave, status }
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const form = useForm(EMPTY, {
    from_date: { required: true, label: 'a start date' }, to_date: { required: true, label: 'an end date' },
    destination: { required: true, maxLength: 150, label: 'the destination' },
    reason: { required: true, minLength: 5, maxLength: 500, label: 'a reason' }, contact_phone: { type: 'phone' },
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.validate((v) => ({ to_date: v.to_date && v.from_date && v.to_date < v.from_date ? 'End date must be on or after the start date' : '' }))) return;
    setSaving(true);
    try {
      await api.post('/leaves', form.values);
      toast.success('Leave request sent to the warden');
      setApplying(false);
      reload();
    } catch (err) {
      form.setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const decide = async () => {
    setSaving(true);
    try {
      await api.put(`/leaves/${deciding.leave.id}/decision`, { status: deciding.status, warden_remark: remark });
      toast.success(`Leave ${deciding.status}`);
      setDeciding(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (l) => {
    if (!(await confirm({ title: 'Cancel request', message: 'Cancel this leave request?', confirmText: 'Cancel request' }))) return;
    try {
      await api.put(`/leaves/${l.id}/cancel`);
      toast.success('Request cancelled');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const columns = [
    ...(!isStudent ? [{ key: 'student_name', header: 'Student', sortable: true, render: (l) => <><strong>{l.student_name}</strong><span className="cell-sub">{l.roll_number}{l.room_number ? ` / Room ${l.room_number}` : ''}</span></> }] : []),
    { key: 'from_date', header: 'Dates', sortable: true, render: (l) => <span className="nowrap">{fmtDate(l.from_date)} to {fmtDate(l.to_date)}</span> },
    { key: 'destination', header: 'Destination', render: (l) => <><strong>{l.destination}</strong><span className="cell-sub">{l.reason}</span></> },
    { key: 'status', header: 'Status', render: (l) => <><StatusBadge value={l.status} />{l.warden_remark && <span className="cell-sub">{l.warden_remark}</span>}</> },
    { key: 'actions', header: '', className: 'right', render: (l) => l.status === 'pending' && (
      <div className="row-actions">
        {isStudent
          ? <button className="btn btn-ghost btn-sm" onClick={() => cancel(l)}>Cancel</button>
          : <>
              <button className="btn btn-primary btn-sm" onClick={() => { setRemark(''); setDeciding({ leave: l, status: 'approved' }); }}><Check size={15} /> Approve</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setRemark(''); setDeciding({ leave: l, status: 'rejected' }); }}><X size={15} /> Reject</button>
            </>}
      </div>
    ) },
  ];

  const bind = (n) => ({ name: n, value: form.values[n], onChange: form.handleChange, error: form.errors[n] });

  return (
    <>
      <PageHeader title={isStudent ? 'Leave' : 'Leave requests'} subtitle={isStudent ? 'Apply for leave and track the warden’s decision.' : 'Review and decide on student leave requests.'}
        actions={isStudent && <button className="btn btn-primary" onClick={() => { form.reset({ ...EMPTY, from_date: todayISO(), to_date: todayISO() }); setApplying(true); }}><Plus size={16} /> Apply for leave</button>} />
      {error ? <div className="form-error">{error}</div> : (
        <DataTable columns={columns} rows={data || []} loading={loading} searchKeys={isStudent ? ['destination', 'reason'] : ['student_name', 'roll_number', 'destination']}
          filters={[{ key: 'status', label: 'All statuses', options: ['pending', 'approved', 'rejected', 'cancelled'] }]} empty={isStudent ? 'You have not applied for any leave.' : 'No leave requests yet.'} />
      )}

      {applying && (
        <Modal title="Apply for leave" onClose={() => setApplying(false)}
          footer={<><button className="btn btn-ghost" onClick={() => setApplying(false)}>Cancel</button><button className="btn btn-primary" form="leave-form" disabled={saving}>{saving ? 'Sending...' : 'Send request'}</button></>}>
          <form id="leave-form" className="form-grid" onSubmit={submit} noValidate>
            <Input label="From" type="date" min={todayISO()} required {...bind('from_date')} />
            <Input label="To" type="date" min={form.values.from_date || todayISO()} required {...bind('to_date')} />
            <Input className="span-2" label="Destination" required {...bind('destination')} />
            <Input className="span-2" label="Contact phone during leave" {...bind('contact_phone')} />
            <TextArea className="span-2" label="Reason" required {...bind('reason')} />
          </form>
        </Modal>
      )}

      {deciding && (
        <Modal title={`${deciding.status === 'approved' ? 'Approve' : 'Reject'} leave`} size="sm" onClose={() => setDeciding(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setDeciding(null)}>Cancel</button><button className={`btn ${deciding.status === 'approved' ? 'btn-primary' : 'btn-danger'}`} onClick={decide} disabled={saving}>{saving ? 'Saving...' : deciding.status === 'approved' ? 'Approve' : 'Reject'}</button></>}>
          <p className="muted-text" style={{ marginBottom: 12 }}>{deciding.leave.student_name}: {fmtDate(deciding.leave.from_date)} to {fmtDate(deciding.leave.to_date)}</p>
          <TextArea label="Remark for the student (optional)" rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} />
        </Modal>
      )}
    </>
  );
}
