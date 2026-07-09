import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'shopkeeper') navigate('/shopkeeper');
      else navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container" style={{ justifyContent: 'center', padding: '0 28px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={logoStyles}>P</div>
        <h1 style={{ fontSize: 28, marginTop: 18 }}>PerkPay</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 6 }}>Spend local, earn more.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <label className="label">Email</label>
        <input
          className="input" type="email" required placeholder="you@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <label className="label">Password</label>
        <input
          className="input" type="password" required placeholder="••••••••"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 22 }} disabled={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 22, color: 'var(--text-muted)', fontSize: 14 }}>
        Don't have an account? <Link to="/signup" style={{ color: 'var(--brand)', fontWeight: 600 }}>Sign up</Link>
      </p>
      <p style={{ textAlign: 'center', marginTop: 10, fontSize: 12.5, color: 'var(--text-faint)' }}>
        Shopkeepers &amp; admins use the same login with their assigned email.
      </p>
    </div>
  );
}

const logoStyles = {
  width: 64, height: 64, margin: '0 auto',
  borderRadius: 18, background: 'var(--brand)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700,
};
