import { useEffect, useState } from 'react';
import { api } from '../../api';
import BottomNav from '../../components/BottomNav';
import TopBar from '../../components/TopBar';

export default function Rewards() {
  const [tab, setTab] = useState('available'); // available | saved
  const [offers, setOffers] = useState([]);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listOffers(), api.mySavedOffers().catch(() => ({ savedOffers: [] }))])
      .then(([o, s]) => { setOffers(o.offers); setSaved(s.savedOffers); })
      .finally(() => setLoading(false));
  }, []);

  async function save(offerId) {
    try {
      await api.saveOffer(offerId);
      const s = await api.mySavedOffers();
      setSaved(s.savedOffers);
    } catch (err) { alert(err.message); }
  }

  const list = tab === 'available' ? offers : saved.map((s) => s.offers);

  return (
    <div className="page-container">
      <TopBar title="Rewards & offers" />
      <div className="scroll-area" style={{ paddingTop: 0 }}>
        <div style={tabRow}>
          <TabBtn active={tab === 'available'} onClick={() => setTab('available')}>Available</TabBtn>
          <TabBtn active={tab === 'saved'} onClick={() => setTab('saved')}>My rewards</TabBtn>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-faint)', marginTop: 20 }}>Loading…</p>
        ) : list.length === 0 ? (
          <p style={{ color: 'var(--text-faint)', marginTop: 20, fontSize: 13.5 }}>
            {tab === 'available' ? 'No offers available right now.' : "You haven't saved any offers yet."}
          </p>
        ) : list.filter(Boolean).map((o, i) => (
          <div key={o.id || i} className="card" style={{ padding: 16, marginTop: 12, position: 'relative' }}>
            {o.is_highlighted && (
              <span className="badge" style={{ background: 'var(--tier-2)', color: '#fff', position: 'absolute', top: 12, right: 12 }}>
                Featured
              </span>
            )}
            <p style={{ fontWeight: 700 }}>{o.title}</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 3 }}>{o.shops?.name}</p>
            {o.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>{o.description}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--brand)', fontSize: 13 }}>{o.points_required} pts</span>
              {tab === 'available' && (
                <button className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => save(o.id)}>
                  Save
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}

function TabBtn({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '10px 0', borderRadius: 10, fontWeight: 600, fontSize: 13.5,
        background: active ? 'var(--brand)' : 'var(--bg-subtle)',
        color: active ? '#fff' : 'var(--text-muted)',
      }}
    >
      {children}
    </button>
  );
}

const tabRow = { display: 'flex', gap: 8, marginTop: 4 };
