import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import BottomNav from '../../components/BottomNav';
import TopBar from '../../components/TopBar';

export default function ShopList() {
  const [shops, setShops] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ok | denied | error
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { shops } = await api.nearbyShops(pos.coords.latitude, pos.coords.longitude);
          setShops(shops);
          setStatus('ok');
        } catch (err) {
          setStatus('error');
        }
      },
      () => setStatus('denied'),
      { timeout: 8000 }
    );
  }, []);

  const filtered = shops.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="page-container">
      <TopBar title="All shops" />
      <div className="scroll-area" style={{ paddingTop: 0 }}>
        <input
          className="input" placeholder="Search shops, cafes, salons…"
          value={query} onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        {status === 'loading' && <p style={muted}>Sorting shops by distance…</p>}
        {status === 'denied' && <p style={muted}>Turn on location access to sort shops by distance.</p>}
        {status === 'error' && <p style={muted}>Couldn't load shops. Try again shortly.</p>}
        {status === 'ok' && filtered.length === 0 && <p style={muted}>No shops registered yet.</p>}

        {filtered.map((s) => (
          <Link key={s.id} to={`/shops/${s.id}`} className="card" style={shopRow}>
            <div style={avatar}>{s.name[0]}</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 3 }}>
                {s.category} · {s.distance_km?.toFixed(1)} km away
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--brand)', marginTop: 3, fontWeight: 600 }}>
                Earn {s.earn_points_per_100} pts per ₹100
              </p>
            </div>
          </Link>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}

const muted = { color: 'var(--text-faint)', fontSize: 13.5, padding: '20px 0', textAlign: 'center' };

const shopRow = {
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  padding: 14,
  marginBottom: 10,
};

const avatar = {
  width: 48, height: 48, borderRadius: 12,
  background: 'var(--brand-light)', color: 'var(--brand-dark)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 700, fontSize: 18, flexShrink: 0,
};
