import { useEffect, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { api } from '../../api';

export default function AdminShell() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('shops'); // shops | shopkeepers

  return (
    <div className="page-container" style={{ maxWidth: 560 }}>
      <header style={{ padding: '20px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Admin</p>
          <h2 style={{ fontSize: 19 }}>{user?.name}</h2>
        </div>
        <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} onClick={logout}>Log out</button>
      </header>

      <div style={{ display: 'flex', gap: 8, padding: '0 20px 14px' }}>
        <TabBtn active={tab === 'shops'} onClick={() => setTab('shops')}>Shops</TabBtn>
        <TabBtn active={tab === 'shopkeepers'} onClick={() => setTab('shopkeepers')}>Shopkeepers</TabBtn>
      </div>

      <div className="scroll-area" style={{ paddingTop: 0 }}>
        {tab === 'shops' ? <ShopsPanel /> : <ShopkeepersPanel />}
      </div>
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

// ---------------------------------------------------------
function ShopsPanel() {
  const [shops, setShops] = useState([]);
  const [shopkeepers, setShopkeepers] = useState([]);
  const [form, setForm] = useState({ name: '', address: '', lat: '', lng: '', category: 'cafe', earn_points_per_100: '10', redeem_points_per_rupee: '10', owner_id: '', upi_id: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const [s, k] = await Promise.all([api.listShops(), api.listShopkeepers()]);
    setShops(s.shops);
    setShopkeepers(k.shopkeepers);
  }

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  async function useMyLocation() {
    navigator.geolocation.getCurrentPosition((pos) => {
      update('lat', pos.coords.latitude.toFixed(6));
      update('lng', pos.coords.longitude.toFixed(6));
    });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.createShop({
        name: form.name,
        address: form.address,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        category: form.category,
        earn_points_per_100: parseInt(form.earn_points_per_100, 10),
        redeem_points_per_rupee: parseInt(form.redeem_points_per_rupee, 10),
        owner_id: form.owner_id || null,
        upi_id: form.upi_id,
      });
      setForm({ name: '', address: '', lat: '', lng: '', category: 'cafe', earn_points_per_100: '10', redeem_points_per_rupee: '10', owner_id: '', upi_id: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="card" style={{ padding: 18 }}>
        <p style={{ fontWeight: 700, marginBottom: 12 }}>Register a new shop</p>

        <label className="label">Shop name</label>
        <input className="input" required value={form.name} onChange={(e) => update('name', e.target.value)} style={{ marginBottom: 12 }} />

        <label className="label">Address</label>
        <input className="input" required value={form.address} onChange={(e) => update('address', e.target.value)} style={{ marginBottom: 12 }} />

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Latitude</label>
            <input className="input" required type="number" step="any" value={form.lat} onChange={(e) => update('lat', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Longitude</label>
            <input className="input" required type="number" step="any" value={form.lng} onChange={(e) => update('lng', e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn btn-secondary" style={{ marginBottom: 12, fontSize: 12.5, padding: '8px 12px' }} onClick={useMyLocation}>
          Use my current location
        </button>

        <label className="label">Category</label>
        <select className="input" value={form.category} onChange={(e) => update('category', e.target.value)} style={{ marginBottom: 12 }}>
          <option value="cafe">Cafe</option>
          <option value="restaurant">Restaurant</option>
          <option value="salon">Salon</option>
          <option value="other">Other</option>
        </select>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Earn pts / ₹100</label>
            <input className="input" required type="number" value={form.earn_points_per_100} onChange={(e) => update('earn_points_per_100', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Pts to redeem ₹1</label>
            <input className="input" required type="number" value={form.redeem_points_per_rupee} onChange={(e) => update('redeem_points_per_rupee', e.target.value)} />
          </div>
        </div>

        <label className="label">Shopkeeper's UPI ID</label>
        <input className="input" required placeholder="e.g. shopname@okhdfcbank"
          value={form.upi_id} onChange={(e) => update('upi_id', e.target.value)} style={{ marginBottom: 4 }} />
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 12 }}>
          Payments go directly to this VPA — PerkPay never holds the money.
        </p>

        <label className="label">Assign shopkeeper (owner)</label>
        <select className="input" value={form.owner_id} onChange={(e) => update('owner_id', e.target.value)} style={{ marginBottom: 6 }}>
          <option value="">— None yet —</option>
          {shopkeepers.map((sk) => (
            <option key={sk.id} value={sk.id}>{sk.name} ({sk.email})</option>
          ))}
        </select>

        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} disabled={saving}>
          {saving ? 'Creating…' : 'Create shop'}
        </button>
      </form>

      <h3 style={{ fontSize: 15, marginTop: 24, marginBottom: 10 }}>All shops ({shops.length})</h3>
      {shops.map((s) => (
        <div key={s.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
          <p style={{ fontWeight: 600, fontSize: 14.5 }}>{s.name}</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{s.address}</p>
          {s.upi_id && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>UPI: {s.upi_id}</p>}
          <p style={{ fontSize: 12, color: 'var(--brand)', marginTop: 4, fontWeight: 600 }}>
            {s.owner_id ? 'Owner assigned' : 'No shopkeeper assigned yet'}
          </p>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------
function ShopkeepersPanel() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const { shopkeepers } = await api.listShopkeepers();
    setList(shopkeepers);
  }

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.createShopkeeper(form);
      setForm({ name: '', email: '', password: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="card" style={{ padding: 18 }}>
        <p style={{ fontWeight: 700, marginBottom: 12 }}>Create shopkeeper login</p>
        <label className="label">Name</label>
        <input className="input" required value={form.name} onChange={(e) => update('name', e.target.value)} style={{ marginBottom: 12 }} />
        <label className="label">Email</label>
        <input className="input" required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} style={{ marginBottom: 12 }} />
        <label className="label">Temporary password</label>
        <input className="input" required minLength={6} value={form.password} onChange={(e) => update('password', e.target.value)} style={{ marginBottom: 12 }} />
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={saving}>{saving ? 'Creating…' : 'Create account'}</button>
      </form>

      <h3 style={{ fontSize: 15, marginTop: 24, marginBottom: 10 }}>Shopkeeper accounts ({list.length})</h3>
      {list.map((sk) => (
        <div key={sk.id} className="card" style={{ padding: 14, marginBottom: 8 }}>
          <p style={{ fontWeight: 600, fontSize: 14.5 }}>{sk.name}</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>{sk.email}</p>
        </div>
      ))}
    </>
  );
}
