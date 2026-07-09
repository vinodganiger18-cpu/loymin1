import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', referralCode: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signup({ ...form, role: 'customer' });
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container" style={{ justifyContent: 'center', padding: '0 28px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 26 }}>Create your account</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 6 }}>Join PerkPay and start earning perks.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <label className="label">Full name</label>
        <input className="input" required placeholder="Rohan Sharma"
          value={form.name} onChange={(e) => update('name', e.target.value)} style={{ marginBottom: 16 }} />

        <label className="label">Email</label>
        <input className="input" type="email" required placeholder="you@example.com"
          value={form.email} onChange={(e) => update('email', e.target.value)} style={{ marginBottom: 16 }} />

        <label className="label">Password</label>
        <input className="input" type="password" required minLength={6} placeholder="At least 6 characters"
          value={form.password} onChange={(e) => update('password', e.target.value)} style={{ marginBottom: 16 }} />

        <label className="label">Referral code <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(optional)</span></label>
        <input className="input" placeholder="e.g. ROHAN1234"
          value={form.referralCode} onChange={(e) => update('referralCode', e.target.value)} />

        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 22 }} disabled={loading}>
          {loading ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 22, color: 'var(--text-muted)', fontSize: 14 }}>
        Already have an account? <Link to="/login" style={{ color: 'var(--brand)', fontWeight: 600 }}>Log in</Link>
      </p>
    </div>
  );
}
