import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import { api } from '../../api';
import BottomNav from '../../components/BottomNav';

export default function Dashboard() {
  const { user } = useAuth();
  const [txns, setTxns] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.myTransactions(), api.listOffers()])
      .then(([t, o]) => {
        setTxns(t.transactions.slice(0, 3));
        setOffers(o.offers.filter((x) => x.is_highlighted).slice(0, 2));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-container">
      <div className="scroll-area">
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Hi, {user?.name?.split(' ')[0]} 👋</p>
        <h1 style={{ fontSize: 24, marginTop: 2 }}>Let's earn some perks today.</h1>

        <div style={balanceCard}>
          <p style={{ opacity: 0.85, fontSize: 13, fontWeight: 600 }}>TOTAL COINS EARNED</p>
          <h1 style={{ fontSize: 40, color: '#fff', marginTop: 6 }}>{user?.points_balance ?? 0}</h1>
          <p style={{ opacity: 0.85, fontSize: 13, marginTop: 2 }}>lifetime · redeemable per shop, see Profile</p>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <Link to="/scan" className="btn btn-primary" style={{ flex: 1 }}>▣ Scan to earn</Link>
          <Link to="/shops" className="btn btn-secondary" style={{ flex: 1 }}>⚑ Nearby shops</Link>
        </div>

        <SectionHeader title="Recent transactions" to="/profile" />
        {loading ? <SkeletonRows /> : txns.length === 0 ? (
          <EmptyState text="No transactions yet. Scan a QR at a shop to get started." />
        ) : txns.map((t) => (
          <div key={t.id} className="card" style={rowCard}>
            <div>
              <p style={{ fontWeight: 600, fontSize: 14.5 }}>{t.shops?.name || 'Shop'}</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>
                {new Date(t.created_at).toLocaleDateString()}
              </p>
            </div>
            <p style={{ fontWeight: 700, color: t.status === 'failed' ? 'var(--danger)' : 'var(--success)' }}>
              ₹{t.amount}
            </p>
          </div>
        ))}

        <SectionHeader title="Featured offers" to="/rewards" />
        {offers.length === 0 ? (
          <EmptyState text="No featured offers right now — check back soon." />
        ) : offers.map((o) => (
          <div key={o.id} style={offerCard}>
            <p style={{ fontWeight: 700, fontSize: 15 }}>{o.title}</p>
            <p style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{o.shops?.name} · {o.points_required} pts</p>
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}

function SectionHeader({ title, to }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 10 }}>
      <h3 style={{ fontSize: 16 }}>{title}</h3>
      <Link to={to} style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 600 }}>View all</Link>
    </div>
  );
}

function EmptyState({ text }) {
  return <p style={{ fontSize: 13.5, color: 'var(--text-faint)', padding: '10px 2px' }}>{text}</p>;
}

function SkeletonRows() {
  return (
    <>
      {[0, 1].map((i) => (
        <div key={i} className="card" style={{ ...rowCard, opacity: 0.5 }}>
          <div style={{ width: '60%', height: 14, background: 'var(--bg-subtle)', borderRadius: 4 }} />
        </div>
      ))}
    </>
  );
}

const balanceCard = {
  marginTop: 18,
  padding: '20px 22px',
  borderRadius: 'var(--radius-lg)',
  background: 'linear-gradient(135deg, var(--brand), var(--brand-dark))',
  boxShadow: 'var(--shadow-md)',
};

const rowCard = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 16px',
  marginBottom: 10,
};

const offerCard = {
  padding: '16px 18px',
  borderRadius: 'var(--radius-md)',
  background: 'linear-gradient(135deg, var(--tier-2), #C9601F)',
  color: '#fff',
  marginBottom: 10,
};
