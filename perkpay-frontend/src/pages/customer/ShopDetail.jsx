import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';
import TopBar from '../../components/TopBar';

export default function ShopDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [shop, setShop] = useState(null);
  const [offers, setOffers] = useState([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [myPoints, setMyPoints] = useState(0);

  useEffect(() => {
    api.getShop(id).then((r) => setShop(r.shop));
    api.listOffers(id).then((r) => setOffers(r.offers));
    api.myFavorites().then((r) => setIsFavorite(r.favorites.some((f) => f.shop_id === id))).catch(() => {});
    api.myShopPoints(id).then((r) => setMyPoints(r.balance)).catch(() => {});
  }, [id]);

  async function toggleFavorite() {
    try {
      if (isFavorite) await api.removeFavorite(id);
      else await api.addFavorite(id);
      setIsFavorite(!isFavorite);
    } catch (_) {}
  }

  async function saveOffer(offerId) {
    try {
      await api.saveOffer(offerId);
      alert('Offer saved to your rewards.');
    } catch (err) {
      alert(err.message);
    }
  }

  if (!shop) return <div className="page-container"><TopBar title="Shop" back /></div>;

  return (
    <div className="page-container">
      <TopBar title={shop.name} back right={
        <button onClick={toggleFavorite} aria-label="Toggle favorite" style={{ fontSize: 20, color: isFavorite ? 'var(--danger)' : 'var(--text-faint)' }}>
          {isFavorite ? '♥' : '♡'}
        </button>
      } />
      <div className="scroll-area" style={{ paddingTop: 0 }}>
        <div style={hero}>{shop.name[0]}</div>
        <h1 style={{ fontSize: 22, marginTop: 14 }}>{shop.name}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>{shop.address}</p>

        <div className="card" style={{ padding: 16, marginTop: 18 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Earn points</p>
          <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--brand)', marginTop: 2 }}>
            {shop.earn_points_per_100} points for every ₹100 spent
          </p>
        </div>

        <div className="card" style={{ padding: 16, marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Your points here</p>
          <p style={{ fontWeight: 700, fontSize: 18 }}>{myPoints} pts</p>
        </div>

        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 18 }}
          onClick={() => navigate('/scan')}
        >
          ▣ Scan QR to pay & earn
        </button>

        <h3 style={{ fontSize: 16, marginTop: 28, marginBottom: 12 }}>Offers at this shop</h3>
        {offers.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--text-faint)' }}>No active offers right now.</p>
        ) : offers.map((o) => (
          <div key={o.id} className="card" style={{ padding: 16, marginBottom: 10, position: 'relative' }}>
            {o.is_highlighted && <span className="badge" style={{ background: 'var(--tier-2)', color: '#fff', position: 'absolute', top: 12, right: 12 }}>Featured</span>}
            <p style={{ fontWeight: 700 }}>{o.title}</p>
            {o.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{o.description}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)' }}>{o.points_required} pts</span>
              <button className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => saveOffer(o.id)}>
                Save offer
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const hero = {
  width: '100%', height: 140, borderRadius: 'var(--radius-lg)',
  background: 'linear-gradient(135deg, var(--brand), var(--brand-dark))',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#fff', fontSize: 44, fontWeight: 700, fontFamily: 'var(--font-display)',
};
