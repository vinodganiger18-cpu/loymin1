import { useState } from 'react';
import ShopkeeperHome from './ShopkeeperHome';
import ShopkeeperOffers from './ShopkeeperOffers';
import ShopkeeperHistory from './ShopkeeperHistory';

export default function ShopkeeperShell() {
  const [tab, setTab] = useState('bill'); // bill | offers | history

  return (
    <div className="page-container">
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 76 }}>
        {tab === 'bill' && <ShopkeeperHome />}
        {tab === 'offers' && <ShopkeeperOffers />}
        {tab === 'history' && <ShopkeeperHistory />}
      </div>

      <nav style={navStyle}>
        <TabButton active={tab === 'bill'} onClick={() => setTab('bill')} label="Generate bill" icon="▣" />
        <TabButton active={tab === 'offers'} onClick={() => setTab('offers')} label="Offers" icon="★" />
        <TabButton active={tab === 'history'} onClick={() => setTab('history')} label="History" icon="≡" />
      </nav>
    </div>
  );
}

function TabButton({ active, onClick, label, icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '10px 0', fontSize: 12, fontWeight: 600,
        color: active ? 'var(--brand)' : 'var(--text-faint)',
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      {label}
    </button>
  );
}

const navStyle = {
  position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
  width: '100%', maxWidth: 480, display: 'flex',
  background: '#fff', borderTop: '1px solid var(--border)',
  padding: '6px 8px calc(6px + env(safe-area-inset-bottom))', zIndex: 50,
};
