import { useEffect, useState } from 'react';
import api, { errorMessage, fieldErrors } from '../api/client';
import useFetch from '../hooks/useFetch';
import useForm from '../hooks/useForm';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { Loader } from '../components/State';
import { Input, Select, TextArea } from '../components/FormControls';
import { ROLE_LABEL } from '../components/navigation';
import { bedLabel, label } from '../utils/format';

export default function Profile() {
  const { user, refresh } = useAuth();
  const { toast } = useUI();
  const isStudent = user.role === 'student';
  const student = useFetch(isStudent ? `/students/${user.student_id}` : '/auth/me', undefined, true);
  const [saving, setSaving] = useState(false);

  const account = useForm({ name: user.name, phone: user.phone || '' }, { name: { required: true, minLength: 2, label: 'your name' }, phone: { type: 'phone' } });
  const details = useForm({ date_of_birth: '', blood_group: '', guardian_name: '', guardian_phone: '', address: '' }, {
    guardian_name: { maxLength: 100, label: "your guardian's name" }, guardian_phone: { type: 'phone', label: "your guardian's phone" }, address: { maxLength: 255 },
  });
  const password = useForm({ current_password: '', new_password: '', confirm: '' }, {
    current_password: { required: true, label: 'your current password' }, new_password: { required: true, minLength: 6, label: 'a new password' },
  });

  useEffect(() => {
    const s = student.data;
    if (isStudent && s) {
      details.reset({ date_of_birth: s.date_of_birth || '', blood_group: s.blood_group || '', guardian_name: s.guardian_name || '', guardian_phone: s.guardian_phone || '', address: s.address || '' });
      account.reset({ name: s.name, phone: s.phone || '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.data]);

  const saveAccount = async (e) => {
    e.preventDefault();
    if (!account.validate()) return;
    setSaving(true);
    try {
      if (isStudent) {
        // students change their phone through the profile endpoint, name is managed by the hostel office
        await api.put(`/students/${user.student_id}`, { ...details.values, phone: account.values.phone });
      } else {
        await api.put('/auth/me', account.values);
      }
      await refresh();
      toast.success('Profile updated');
    } catch (err) {
      account.setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveDetails = async (e) => {
    e.preventDefault();
    if (!details.validate()) return;
    setSaving(true);
    try {
      await api.put(`/students/${user.student_id}`, { ...details.values, phone: account.values.phone });
      toast.success('Details updated');
      student.reload();
    } catch (err) {
      details.setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (!password.validate((v) => ({ confirm: v.confirm !== v.new_password ? 'Passwords do not match' : '' }))) return;
    setSaving(true);
    try {
      await api.post('/auth/change-password', { current_password: password.values.current_password, new_password: password.values.new_password });
      toast.success('Password changed');
      password.reset();
    } catch (err) {
      password.setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (isStudent && student.loading) return <Loader />;
  const s = student.data;
  const bind = (f, n) => ({ name: n, value: f.values[n], onChange: f.handleChange, error: f.errors[n] });

  return (
    <>
      <PageHeader title="My profile" subtitle={`${ROLE_LABEL[user.role]} / ${user.email}`} />
      <div className="grid grid-2">
        <section className="card panel">
          <div className="panel-head"><h3>Account</h3></div>
          <form className="form-grid" onSubmit={isStudent ? saveDetails : saveAccount} noValidate>
            {isStudent
              ? <div className="field span-2"><span className="field-label">Name</span><div>{user.name}</div></div>
              : <Input className="span-2" label="Full name" required {...bind(account, 'name')} />}
            <Input label="Phone" {...bind(account, 'phone')} />
            <div className="field"><span className="field-label">Email</span><div>{user.email}</div></div>
            {isStudent && s && <>
              <Input label="Date of birth" type="date" {...bind(details, 'date_of_birth')} />
              <Select label="Blood group" placeholder="Not specified" options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} {...bind(details, 'blood_group')} />
              <Input label="Guardian name (optional)" {...bind(details, 'guardian_name')} />
              <Input label="Guardian phone (optional)" {...bind(details, 'guardian_phone')} />
              <TextArea className="span-2" label="Home address" {...bind(details, 'address')} />
            </>}
            <div className="span-2"><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button></div>
          </form>
        </section>

        <div className="stack">
          {isStudent && s && (
            <section className="card panel">
              <div className="panel-head"><h3>Hostel record</h3><StatusBadge value={s.status} /></div>
              <dl className="detail-grid">
                <div><dt>Roll number</dt><dd>{s.roll_number}</dd></div>
                <div><dt>Course</dt><dd>{s.course}, year {s.year_of_study}</dd></div>
                <div><dt>Gender</dt><dd>{label(s.gender)}</dd></div>
                <div><dt>Room</dt><dd>{bedLabel(s)}</dd></div>
              </dl>
              <p className="muted-text" style={{ marginTop: 12 }}>To change your name, roll number or course, contact the hostel office.</p>
            </section>
          )}
          <section className="card panel">
            <div className="panel-head"><h3>Change password</h3></div>
            <form className="form-grid" onSubmit={changePassword} noValidate>
              <Input className="span-2" label="Current password" type="password" autoComplete="current-password" {...bind(password, 'current_password')} />
              <Input label="New password" type="password" autoComplete="new-password" {...bind(password, 'new_password')} />
              <Input label="Confirm new password" type="password" autoComplete="new-password" {...bind(password, 'confirm')} />
              <div className="span-2"><button className="btn btn-primary" disabled={saving}>Update password</button></div>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
