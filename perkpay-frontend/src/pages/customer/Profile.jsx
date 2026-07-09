import { useEffect, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { api } from '../../api';
import BottomNav from '../../components/BottomNav';

export default function Profile() {
  const { user, logout } = useAuth();
  const [txns, setTxns] = useState([]);
  const [shopPoints, setShopPoints] = useState([]);

  useEffect(() => {
    api.myTransactions().then((r) => setTxns(r.transactions)).catch(() => {});
    api.myShopPointsList().then((r) => setShopPoints(r.shopPoints)).catch(() => {});
  }, []);

  return (
    <div className="page-container">
      <div className="scroll-area">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={avatar}>{user?.name?.[0]}</div>
          <div>
            <h2 style={{ fontSize: 19 }}>{user?.name}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13.5, marginTop: 2 }}>{user?.email}</p>
          </div>
        </div>

        <div style={balanceCard}>
          <p style={{ fontSize: 13, opacity: 0.85, fontWeight: 600 }}>TOTAL COINS EARNED</p>
          <h1 style={{ fontSize: 34, marginTop: 4 }}>{user?.points_balance}</h1>
          <p style={{ fontSize: 11.5, opacity: 0.8, marginTop: 4 }}>Lifetime total — each shop's points are redeemable only there</p>
        </div>

        <h3 style={{ fontSize: 15, marginTop: 22, marginBottom: 10 }}>Points by shop</h3>
        {shopPoints.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--text-faint)' }}>No points earned at any shop yet.</p>
        ) : shopPoints.map((sp) => (
          <div key={sp.shop_id} className="card" style={{ padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: 14 }}>{sp.shops?.name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{sp.shops?.category}</p>
            </div>
            <p style={{ fontWeight: 700, color: 'var(--brand)' }}>{sp.balance} pts</p>
          </div>
        ))}

        <div className="card" style={{ padding: 16, marginTop: 18 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Your referral code</p>
          <p style={{ fontWeight: 700, fontSize: 18, marginTop: 4, letterSpacing: 1, color: 'var(--brand)' }}>
            {user?.referral_code}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>
            Share this — you both get 50 bonus points when a friend signs up.
          </p>
        </div>

        <h3 style={{ fontSize: 16, marginTop: 26, marginBottom: 10 }}>Transaction history</h3>
        {txns.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--text-faint)' }}>No transactions yet.</p>
        ) : txns.map((t) => (
          <div key={t.id} className="card" style={{ padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: 14 }}>{t.shops?.name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
                {new Date(t.created_at).toLocaleString()} · {t.status}
              </p>
              {t.earned_points > 0 && (
                <p style={{ fontSize: 12, color: 'var(--success)', marginTop: 2, fontWeight: 600 }}>+{t.earned_points} pts earned</p>
              )}
            </div>
            <p style={{ fontWeight: 700 }}>₹{t.amount}</p>
          </div>
        ))}

        <button className="btn btn-ghost btn-block" style={{ marginTop: 24 }} onClick={logout}>
          Log out
        </button>
      </div>
      <BottomNav />
    </div>
  );
}

const avatar = {
  width: 56, height: 56, borderRadius: '50%',
  background: 'var(--brand-light)', color: 'var(--brand-dark)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 700, fontSize: 22,
};

const balanceCard = {
  marginTop: 20,
  padding: '18px 20px',
  borderRadius: 'var(--radius-lg)',
  background: 'linear-gradient(135deg, var(--brand), var(--brand-dark))',
  color: '#fff',
};
