import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../api/client';
import useFetch from '../hooks/useFetch';
import useForm from '../hooks/useForm';
import { useUI } from '../context/UIContext';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { Input, Select } from '../components/FormControls';
import { label } from '../utils/format';

const EMPTY = { name: '', email: '', phone: '', role: 'warden', password: '', is_active: 'true' };
const SPEC = { name: { required: true, minLength: 2, label: 'the full name' }, email: { required: true, type: 'email' }, phone: { type: 'phone' } };

export default function Staff() {
  const { toast, confirm } = useUI();
  const { data, loading, error, reload } = useFetch('/staff');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const form = useForm(EMPTY, SPEC);
  const isNew = editing === 'new';

  const open = (s) => {
    form.reset(s === 'new' ? EMPTY : { name: s.name, email: s.email, phone: s.phone || '', role: s.role, password: '', is_active: String(s.is_active) });
    setEditing(s);
  };

  const submit = async (e) => {
    e.preventDefault();
    const ok = form.validate((v) => ({
      password: isNew ? (!v.password ? 'Enter a password' : v.password.length < 6 ? 'Password must be at least 6 characters' : '') : v.password && v.password.length < 6 ? 'Password must be at least 6 characters' : '',
    }));
    if (!ok) return;
    setSaving(true);
    try {
      const v = form.values;
      if (isNew) await api.post('/staff', v);
      else await api.put(`/staff/${editing.id}`, { ...v, is_active: v.is_active === 'true' });
      toast.success(isNew ? 'Staff account created' : 'Staff account updated');
      setEditing(null);
      reload();
    } catch (err) {
      form.setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    if (!(await confirm({ title: 'Delete staff account', message: `Delete ${s.name}? Complaints assigned to them become unassigned. You can disable the account instead to keep it.`, confirmText: 'Delete' }))) return;
    try {
      await api.delete(`/staff/${s.id}`);
      toast.success('Staff account deleted');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const columns = [
    { key: 'name', header: 'Name', sortable: true, render: (s) => <><strong>{s.name}</strong><span className="cell-sub">{s.email}</span></> },
    { key: 'role', header: 'Role', render: (s) => label(s.role) },
    { key: 'phone', header: 'Phone' },
    { key: 'hostels', header: 'Hostel', render: (s) => s.hostels || '-' },
    { key: 'is_active', header: 'Account', render: (s) => <StatusBadge value={s.is_active ? 'active' : 'inactive'} /> },
    {
      key: 'actions', header: '', className: 'right',
      render: (s) => (
        <div className="row-actions">
          <button className="icon-btn" title="Edit" onClick={() => open(s)}><Pencil size={16} /></button>
          <button className="icon-btn" title="Delete" onClick={() => remove(s)}><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  const bind = (n) => ({ name: n, value: form.values[n], onChange: form.handleChange, error: form.errors[n] });

  return (
    <>
      <PageHeader title="Staff" subtitle="Wardens and maintenance staff who can sign in." actions={<button className="btn btn-primary" onClick={() => open('new')}><Plus size={16} /> Add staff</button>} />
      {error ? <div className="form-error">{error}</div> : (
        <DataTable columns={columns} rows={data || []} loading={loading} searchKeys={['name', 'email', 'phone']}
          filters={[{ key: 'role', label: 'All roles', options: [{ value: 'warden', label: 'Warden' }, { value: 'maintenance', label: 'Maintenance' }] }]}
          empty="No staff accounts yet." />
      )}
      {editing && (
        <Modal title={isNew ? 'Add staff member' : `Edit ${editing.name}`} onClose={() => setEditing(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" form="staff-form" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}>
          <form id="staff-form" className="form-grid" onSubmit={submit} noValidate>
            <Input label="Full name" required {...bind('name')} />
            <Input label="Email" type="email" required {...bind('email')} />
            <Input label="Phone" {...bind('phone')} />
            {isNew
              ? <Select label="Role" required options={[{ value: 'warden', label: 'Hostel warden' }, { value: 'maintenance', label: 'Maintenance staff' }]} {...bind('role')} />
              : <Select label="Account status" options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Disabled' }]} {...bind('is_active')} />}
            <Input className="span-2" label={isNew ? 'Password' : 'Reset password'} type="password" autoComplete="new-password" required={isNew} hint={isNew ? undefined : 'Leave blank to keep the current password.'} {...bind('password')} />
          </form>
        </Modal>
      )}
    </>
  );
}
