import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';
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
import { fmtDate, bedLabel, label } from '../utils/format';

const EMPTY = {
  name: '', email: '', password: '', phone: '', roll_number: '', course: '', year_of_study: '1', gender: 'male',
  date_of_birth: '', blood_group: '', guardian_name: '', guardian_phone: '', address: '', admission_date: '', status: 'active',
};

const SPEC = {
  name: { required: true, minLength: 2, maxLength: 100, label: 'the full name' },
  email: { required: true, type: 'email' },
  phone: { type: 'phone' },
  roll_number: { required: true, maxLength: 30, label: 'the roll number' },
  course: { required: true, maxLength: 100, label: 'the course' },
  year_of_study: { required: true, type: 'int', min: 1, max: 4, label: 'the year of study' },
  guardian_name: { maxLength: 100, label: "the guardian's name" },
  guardian_phone: { type: 'phone', label: "the guardian's phone" },
  address: { maxLength: 255 },
};

export default function Students() {
  const { user } = useAuth();
  const { toast, confirm } = useUI();
  const { data, loading, error, reload } = useFetch('/students');
  const [editing, setEditing] = useState(null); // null | 'new' | student row
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const form = useForm(EMPTY, SPEC);
  const isNew = editing === 'new';

  const hostelOptions = useMemo(() => [...new Set((data || []).map((s) => s.hostel_name).filter(Boolean))], [data]);

  const openForm = (student) => {
    if (student === 'new') form.reset(EMPTY);
    else {
      const v = {};
      Object.keys(EMPTY).forEach((k) => { v[k] = student[k] ?? ''; });
      form.reset({ ...v, password: '', year_of_study: String(student.year_of_study) });
    }
    setEditing(student);
  };

  const submit = async (e) => {
    e.preventDefault();
    const ok = form.validate((v) => ({
      password: isNew ? (!v.password ? 'Enter a temporary password' : v.password.length < 6 ? 'Password must be at least 6 characters' : '') : v.password && v.password.length < 6 ? 'Password must be at least 6 characters' : '',
    }));
    if (!ok) return;
    setSaving(true);
    try {
      const body = { ...form.values };
      if (isNew) delete body.status;
      if (isNew) await api.post('/students', body);
      else await api.put(`/students/${editing.id}`, body);
      toast.success(isNew ? 'Student registered' : 'Student updated');
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
    if (!(await confirm({ title: 'Delete student', message: `Permanently delete ${s.name} and all of their fees, attendance, leave and complaint records? This cannot be undone. To keep the history, set the student to inactive instead.`, confirmText: 'Delete student' }))) return;
    try {
      await api.delete(`/students/${s.id}`);
      toast.success('Student deleted');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const columns = [
    { key: 'name', header: 'Student', sortable: true, render: (s) => <><strong>{s.name}</strong><span className="cell-sub">{s.email}</span></> },
    { key: 'roll_number', header: 'Roll no.', sortable: true },
    { key: 'course', header: 'Course', render: (s) => `${s.course} (Year ${s.year_of_study})` },
    { key: 'hostel_name', header: 'Room', render: (s) => (s.hostel_name ? bedLabel(s) : <span className="muted-text">Not allocated</span>) },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge value={s.status} /> },
    {
      key: 'actions', header: '', className: 'right',
      render: (s) => (
        <div className="row-actions">
          <button className="icon-btn" title="View" onClick={() => setViewing(s)}><Eye size={16} /></button>
          <button className="icon-btn" title="Edit" onClick={() => openForm(s)}><Pencil size={16} /></button>
          {user.role === 'admin' && <button className="icon-btn" title="Delete" onClick={() => remove(s)}><Trash2 size={16} /></button>}
        </div>
      ),
    },
  ];

  const f = form.values;
  const bind = (name) => ({ name, value: f[name], onChange: form.handleChange, error: form.errors[name] });

  return (
    <>
      <PageHeader title="Students" subtitle="Register students and manage their profiles." actions={<button className="btn btn-primary" onClick={() => openForm('new')}><Plus size={16} /> Register student</button>} />
      {error ? <div className="form-error">{error}</div> : (
        <DataTable
          columns={columns} rows={data || []} loading={loading} searchKeys={['name', 'email', 'roll_number', 'course']}
          searchPlaceholder="Search by name, roll number or course"
          filters={[
            { key: 'status', label: 'All statuses', options: ['active', 'inactive', 'alumni'] },
            { key: 'gender', label: 'All genders', options: ['male', 'female', 'other'] },
            { key: 'hostel_name', label: 'All hostels', options: hostelOptions },
          ]}
          empty="No students registered yet."
        />
      )}

      {editing && (
        <Modal title={isNew ? 'Register student' : `Edit ${editing.name}`} size="lg" onClose={() => setEditing(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" form="student-form" disabled={saving}>{saving ? 'Saving...' : isNew ? 'Register' : 'Save changes'}</button></>}>
          <form id="student-form" className="form-grid" onSubmit={submit} noValidate>
            <Input label="Full name" required {...bind('name')} />
            <Input label="Email" type="email" required {...bind('email')} />
            <Input label={isNew ? 'Temporary password' : 'Reset password'} type="password" autoComplete="new-password" required={isNew} hint={isNew ? 'The student can change it after signing in.' : 'Leave blank to keep the current password.'} {...bind('password')} />
            <Input label="Phone" {...bind('phone')} />
            <Input label="Roll number" required {...bind('roll_number')} />
            <Input label="Course" required {...bind('course')} />
            <Select label="Year of study" required options={[1, 2, 3, 4].map((y) => ({ value: String(y), label: `Year ${y}` }))} {...bind('year_of_study')} />
            <Select label="Gender" required options={['male', 'female', 'other'].map((g) => ({ value: g, label: label(g) }))} {...bind('gender')} />
            <Input label="Date of birth" type="date" {...bind('date_of_birth')} />
            <Select label="Blood group" placeholder="Not specified" options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} {...bind('blood_group')} />
            <Input label="Guardian name (optional)" {...bind('guardian_name')} />
            <Input label="Guardian phone (optional)" {...bind('guardian_phone')} />
            <Input label="Admission date" type="date" hint="Defaults to today" {...bind('admission_date')} />
            {!isNew && <Select label="Status" options={['active', 'inactive', 'alumni'].map((s) => ({ value: s, label: label(s) }))} hint="Inactive and alumni students cannot sign in." {...bind('status')} />}
            <TextArea className="span-2" label="Home address" {...bind('address')} />
          </form>
        </Modal>
      )}

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)} footer={<button className="btn btn-ghost" onClick={() => setViewing(null)}>Close</button>}>
          <dl className="detail-grid">
            <div><dt>Roll number</dt><dd>{viewing.roll_number}</dd></div>
            <div><dt>Status</dt><dd><StatusBadge value={viewing.status} /></dd></div>
            <div><dt>Email</dt><dd>{viewing.email}</dd></div>
            <div><dt>Phone</dt><dd>{viewing.phone || '-'}</dd></div>
            <div><dt>Course</dt><dd>{viewing.course}, year {viewing.year_of_study}</dd></div>
            <div><dt>Gender</dt><dd>{label(viewing.gender)}</dd></div>
            <div><dt>Date of birth</dt><dd>{fmtDate(viewing.date_of_birth)}</dd></div>
            <div><dt>Blood group</dt><dd>{viewing.blood_group || '-'}</dd></div>
            <div><dt>Guardian</dt><dd>{viewing.guardian_name || '-'}</dd></div>
            <div><dt>Guardian phone</dt><dd>{viewing.guardian_phone || '-'}</dd></div>
            <div><dt>Admission date</dt><dd>{fmtDate(viewing.admission_date)}</dd></div>
            <div><dt>Room</dt><dd>{bedLabel(viewing)}</dd></div>
            <div className="span-2"><dt>Address</dt><dd>{viewing.address || '-'}</dd></div>
          </dl>
        </Modal>
      )}
    </>
  );
}
