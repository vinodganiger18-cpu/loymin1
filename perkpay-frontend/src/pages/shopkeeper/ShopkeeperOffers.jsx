import { useEffect, useState } from 'react';
import { api } from '../../api';

export default function ShopkeeperOffers() {
  const [shop, setShop] = useState(null);
  const [offers, setOffers] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', points_required: '', reward_type: 'discount_coupon', reward_value: '', is_highlighted: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { shops } = await api.listShops();
    const myShop = shops[0];
    setShop(myShop);
    if (myShop) {
      const { offers } = await api.listOffers(myShop.id);
      setOffers(offers);
    }
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!shop) { setError('No shop is assigned to your account yet — contact the admin.'); return; }
    setSaving(true);
    try {
      await api.createOffer({
        shop_id: shop.id,
        title: form.title,
        description: form.description,
        points_required: parseInt(form.points_required, 10),
        reward_type: form.reward_type,
        reward_value: form.reward_value,
        is_highlighted: form.is_highlighted,
      });
      setForm({ title: '', description: '', points_required: '', reward_type: 'discount_coupon', reward_value: '', is_highlighted: false });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleHighlight(offer) {
    await api.updateOffer(offer.id, { is_highlighted: !offer.is_highlighted });
    load();
  }

  async function deleteOffer(offer) {
    if (!confirm(`Delete "${offer.title}"? This can't be undone.`)) return;
    try {
      await api.deleteOffer(offer.id);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  if (!shop) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No shop assigned to your account yet — contact the admin.</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ fontSize: 19, marginBottom: 4 }}>Offers for {shop.name}</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>Posted offers appear on the customer app instantly.</p>

      <form onSubmit={submit} className="card" style={{ padding: 18 }}>
        <label className="label">Offer title</label>
        <input className="input" required placeholder="e.g. Free Coffee, Buy 5 Get 1"
          value={form.title} onChange={(e) => update('title', e.target.value)} style={{ marginBottom: 12 }} />

        <label className="label">Description</label>
        <textarea className="input" rows={2} placeholder="Short description shown to customers"
          value={form.description} onChange={(e) => update('description', e.target.value)} style={{ marginBottom: 12, resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Points required</label>
            <input className="input" type="number" required min={1} placeholder="200"
              value={form.points_required} onChange={(e) => update('points_required', e.target.value)} style={{ marginBottom: 12 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Reward type</label>
            <select className="input" value={form.reward_type} onChange={(e) => update('reward_type', e.target.value)} style={{ marginBottom: 12 }}>
              <option value="discount_coupon">Discount coupon</option>
              <option value="free_item">Free item</option>
            </select>
          </div>
        </div>

        <label className="label">Reward value</label>
        <input className="input" placeholder="e.g. ₹60 OFF or Free Coffee"
          value={form.reward_value} onChange={(e) => update('reward_value', e.target.value)} style={{ marginBottom: 12 }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 6 }}>
          <input type="checkbox" checked={form.is_highlighted} onChange={(e) => update('is_highlighted', e.target.checked)} style={{ width: 18, height: 18 }} />
          Highlight this offer (featured on customer home)
        </label>

        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} disabled={saving}>
          {saving ? 'Posting…' : 'Post offer'}
        </button>
      </form>

      <h3 style={{ fontSize: 15, marginTop: 26, marginBottom: 10 }}>Your posted offers</h3>
      {offers.length === 0 ? (
        <p style={{ fontSize: 13.5, color: 'var(--text-faint)' }}>No offers posted yet.</p>
      ) : offers.map((o) => (
        <div key={o.id} className="card" style={{ padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14 }}>{o.title}</p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{o.points_required} pts · {o.reward_value}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn"
              style={{
                padding: '7px 12px', fontSize: 12.5, borderRadius: 8,
                background: o.is_highlighted ? 'var(--tier-2)' : 'var(--bg-subtle)',
                color: o.is_highlighted ? '#fff' : 'var(--text-muted)',
              }}
              onClick={() => toggleHighlight(o)}
            >
              {o.is_highlighted ? 'Highlighted' : 'Highlight'}
            </button>
            <button
              className="btn"
              style={{ padding: '7px 10px', fontSize: 12.5, borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--danger)' }}
              onClick={() => deleteOffer(o)}
              aria-label={`Delete ${o.title}`}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
