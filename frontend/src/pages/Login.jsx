import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, ShieldCheck, GraduationCap, Wrench, Building2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';

const roles = [
  { id: 'admin', label: 'Administrator', Icon: ShieldCheck },
  { id: 'warden', label: 'Warden', Icon: Building2 },
  { id: 'student', label: 'Student', Icon: GraduationCap },
  { id: 'maintenance', label: 'Maintenance', Icon: Wrench },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!email.trim() || !password) return setFormError('Enter your email and password.');
    setSubmitting(true);
    try {
      await login(email.trim(), password, role);
      navigate('/', { replace: true });
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel">
        <div className="auth-brand"><span className="auth-brand-mark">H</span><div><strong>Hostel Management</strong><small>One place for hostel operations</small></div></div>
        <div className="auth-brand-copy">
          <span className="auth-eyebrow">HOSTEL MANAGEMENT SYSTEM</span>
          <h1>Everything your hostel needs, in one place.</h1>
          <p>Manage rooms, students, fees, attendance, leave requests and maintenance through one simple workspace.</p>
          <div className="auth-feature-list"><span>Room &amp; bed allocation</span><span>Fees and receipts</span><span>Student services</span></div>
        </div>
        <div className="auth-brand-footer">A simpler way to manage campus living.</div>
      </section>
      <section className="auth-content-panel">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-mobile-brand"><span className="auth-brand-mark">H</span><strong>Hostel Management</strong></div>
          <span className="auth-eyebrow auth-blue-eyebrow">WELCOME BACK</span>
          <h2>Sign in to your account</h2>
          <p className="auth-subtitle">Choose your account type and enter your credentials.</p>
          <div className="role-grid" aria-label="Choose login role">
            {roles.map(({ id, label, Icon }) => <button type="button" key={id} className={`role-option ${role === id ? 'selected' : ''}`} onClick={() => { setRole(id); setFormError(''); }} aria-pressed={role === id}><Icon size={19}/><span>{label}</span></button>)}
          </div>
          {formError && <div className="auth-error" role="alert">{formError}</div>}
          <label className="auth-field"><span>Email address</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="username" required /></label>
          <label className="auth-field"><span>Password</span><div className="auth-password-wrap"><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required/><button type="button" className="auth-eye" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
          <button className="auth-submit" type="submit" disabled={submitting}><LogIn size={18}/>{submitting ? 'Signing in…' : `Sign in as ${roles.find(r => r.id === role).label}`}</button>
          <p className="auth-switch">New student? <Link to="/signup">Create a student account</Link></p>
          <p className="auth-note">Warden and staff accounts are provided by the hostel administrator.</p>
        </form>
      </section>
    </main>
  );
}
