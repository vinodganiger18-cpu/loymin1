import { useEffect, useState } from 'react';
import { api } from '../../api';

export default function ShopkeeperHistory() {
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [s, t] = await Promise.all([api.myShopSummary(), api.myShopTransactions()]);
      setSummary(s);
      setTxns(t.transactions);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)' }}>Loading…</div>;
  if (error) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--danger)' }}>{error}</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ fontSize: 19, marginBottom: 4 }}>{summary?.shop?.name}</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>Today's activity & full transaction history</p>

      <div style={{ display: 'flex', gap: 12 }}>
        <div className="card" style={{ ...statCard, background: 'linear-gradient(135deg, var(--brand), var(--brand-dark))' }}>
          <p style={statLabel}>TRANSACTIONS TODAY</p>
          <h1 style={{ fontSize: 30, color: '#fff', marginTop: 6 }}>{summary?.todayCount ?? 0}</h1>
        </div>
        <div className="card" style={{ ...statCard, background: 'linear-gradient(135deg, var(--tier-3), #1E7A40)' }}>
          <p style={statLabel}>COLLECTED TODAY</p>
          <h1 style={{ fontSize: 30, color: '#fff', marginTop: 6 }}>₹{summary?.todayTotal ?? 0}</h1>
        </div>
      </div>

      <h3 style={{ fontSize: 15, marginTop: 26, marginBottom: 10 }}>All transactions</h3>
      {txns.length === 0 ? (
        <p style={{ fontSize: 13.5, color: 'var(--text-faint)' }}>No transactions yet.</p>
      ) : txns.map((t) => (
        <div key={t.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: 14 }}>{t.users?.name || 'Guest'}</p>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
                {new Date(t.created_at).toLocaleString()}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 700, fontSize: 15 }}>₹{t.amount}</p>
              <StatusBadge status={t.status} />
            </div>
          </div>
          {(t.reward_value_used > 0 || t.upi_paid > 0) && (
            <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 8 }}>
              {t.reward_value_used > 0 && `₹${t.reward_value_used} via points`}
              {t.reward_value_used > 0 && t.upi_paid > 0 && ' + '}
              {t.upi_paid > 0 && `₹${t.upi_paid} via UPI`}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    success: { label: 'Paid', bg: 'var(--success)' },
    partial_paid: { label: 'Paid (partial)', bg: 'var(--success)' },
    reward_paid: { label: 'Paid with points', bg: 'var(--brand)' },
    pending: { label: 'Pending', bg: 'var(--warning)' },
    failed: { label: 'Failed', bg: 'var(--danger)' },
    expired: { label: 'Expired', bg: 'var(--text-faint)' },
  };
  const cfg = map[status] || { label: status, bg: 'var(--text-faint)' };
  return (
    <span className="badge" style={{ background: cfg.bg, color: '#fff', marginTop: 4 }}>
      {cfg.label}
    </span>
  );
}

const statCard = {
  flex: 1,
  padding: '16px 16px',
  border: 'none',
};

const statLabel = {
  fontSize: 11.5,
  fontWeight: 700,
  color: 'rgba(255,255,255,0.85)',
};
