import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import api, { errorMessage } from '../api/client';

const initial = { name: '', email: '', password: '', phone: '', roll_number: '', course: '', year_of_study: '1', gender: '', guardian_name: '', guardian_phone: '' };

export default function Signup() {
  const navigate = useNavigate();
  const [values, setValues] = useState(initial);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const update = (event) => setValues(v => ({ ...v, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (values.password.length < 8) return setError('Password must contain at least 8 characters.');
    setSubmitting(true);
    try {
      await api.post('/auth/signup', { ...values, year_of_study: Number(values.year_of_study) });
      navigate('/login', { replace: true, state: { message: 'Account created. Sign in with your new credentials.', email: values.email } });
    } catch (err) { setError(errorMessage(err)); }
    finally { setSubmitting(false); }
  };
  return (
    <main className="auth-shell auth-signup-shell">
      <section className="auth-brand-panel auth-signup-brand">
        <div className="auth-brand"><span className="auth-brand-mark">H</span><div><strong>Hostel Management</strong><small>Student registration</small></div></div>
        <div className="auth-brand-copy"><span className="auth-eyebrow">GET STARTED</span><h1>Your hostel journey starts here.</h1><p>Create your student account to access room information, fee details, attendance, leave requests and hostel services.</p></div>
        <div className="auth-brand-footer">Secure student registration.</div>
      </section>
      <section className="auth-content-panel auth-signup-content">
        <form className="auth-card auth-signup-card" onSubmit={submit}>
          <Link className="auth-back-link" to="/login"><ArrowLeft size={16}/> Back to sign in</Link>
          <span className="auth-eyebrow auth-blue-eyebrow">STUDENT PORTAL</span><h2>Create your account</h2><p className="auth-subtitle">Enter your details to register as a student.</p>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="auth-form-grid">
            <label className="auth-field"><span>Full name</span><input name="name" value={values.name} onChange={update} required minLength="2" placeholder="Your full name"/></label>
            <label className="auth-field"><span>Email address</span><input name="email" type="email" value={values.email} onChange={update} required placeholder="you@example.com"/></label>
            <label className="auth-field"><span>Phone number</span><input name="phone" value={values.phone} onChange={update} required placeholder="Phone number"/></label>
            <label className="auth-field"><span>Register number</span><input name="roll_number" value={values.roll_number} onChange={update} required placeholder="College register number"/></label>
            <label className="auth-field"><span>Course / Department</span><input name="course" value={values.course} onChange={update} required placeholder="e.g. B.Tech Information Technology"/></label>
            <label className="auth-field"><span>Year of study</span><select name="year_of_study" value={values.year_of_study} onChange={update}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}{n===1?'st':n===2?'nd':n===3?'rd':'th'} year</option>)}</select></label>
            <label className="auth-field"><span>Gender</span><select name="gender" value={values.gender} onChange={update} required><option value="">Select gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
            <label className="auth-field"><span>Guardian name (optional)</span><input name="guardian_name" value={values.guardian_name} onChange={update}  placeholder="Guardian full name"/></label>
            <label className="auth-field"><span>Guardian phone (optional)</span><input name="guardian_phone" value={values.guardian_phone} onChange={update} placeholder="Guardian contact number"/></label>
            <label className="auth-field"><span>Password (min. 8 characters)</span><div className="auth-password-wrap"><input name="password" type={showPassword?'text':'password'} value={values.password} onChange={update} required minLength="8" autoComplete="new-password" placeholder="Create a password"/><button type="button" className="auth-eye" onClick={()=>setShowPassword(v=>!v)} aria-label="Toggle password visibility">{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
          </div>
          <button className="auth-submit" type="submit" disabled={submitting}><UserPlus size={18}/>{submitting?'Creating account…':'Create student account'}</button>
          <p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p>
          <p className="auth-note">Admin, warden and maintenance accounts must be created by the administrator.</p>
        </form>
      </section>
    </main>
  );
}
