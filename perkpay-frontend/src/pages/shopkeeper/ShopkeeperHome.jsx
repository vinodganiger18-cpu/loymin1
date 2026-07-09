import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { api } from '../../api';

export default function ShopkeeperHome() {
  const { user, logout } = useAuth();
  const [amount, setAmount] = useState('');
  const [qr, setQr] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | pending | success
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function generate(e) {
    e.preventDefault();
    setError('');
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) { setError('Enter a valid bill amount.'); return; }

    try {
      const data = await api.generateQr(amt);
      setQr(data);
      setStatus('pending');
      startPolling(data.orderId);
    } catch (err) {
      setError(err.message);
    }
  }

  function startPolling(orderId) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.paymentStatus(orderId);
        if (['success', 'partial_paid', 'reward_paid'].includes(data.status)) {
          clearInterval(pollRef.current);
          setStatus('success');
        } else if (data.status === 'failed' || data.status === 'expired') {
          clearInterval(pollRef.current);
          setError('Payment failed or the QR code expired.');
          setStatus('idle');
          setQr(null);
        }
      } catch (_) {}
    }, 2500);
  }

  function reset() {
    clearInterval(pollRef.current);
    setQr(null);
    setAmount('');
    setStatus('idle');
  }

  return (
    <div className="page-container">
      <header style={{ padding: '20px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Shopkeeper</p>
          <h2 style={{ fontSize: 19 }}>{user?.name}</h2>
        </div>
        <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} onClick={logout}>Log out</button>
      </header>

      <div className="scroll-area" style={{ paddingTop: 10 }}>
        {status === 'idle' && (
          <form onSubmit={generate} className="card" style={{ padding: 22 }}>
            <label className="label">Bill amount (₹)</label>
            <input
              className="input" type="number" inputMode="numeric" placeholder="e.g. 500"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', padding: '18px 14px' }}
            />
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn-primary btn-block" style={{ marginTop: 18 }}>Generate QR code</button>
          </form>
        )}

        {status === 'pending' && qr && (
          <div style={{ textAlign: 'center' }}>
            <div className="card" style={{ padding: 24, display: 'inline-block' }}>
              <img src={qr.qrDataUrl} alt="Payment QR code" style={{ width: 220, height: 220 }} />
            </div>
            <p style={{ fontSize: 24, fontWeight: 700, marginTop: 16 }}>₹{amount}</p>
            <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 13.5 }}>
              Waiting for customer to scan & pay…
            </p>
            <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 4 }}>
              QR expires in 2 minutes · Order {qr.orderId}
            </p>
            <div className="spinner" style={spinnerStyle} />
            <button className="btn btn-ghost" style={{ marginTop: 20 }} onClick={reset}>Cancel & start over</button>
          </div>
        )}

        {status === 'success' && (
          <div style={{ textAlign: 'center', paddingTop: 20 }}>
            <div style={successCircle}>✓</div>
            <h2 style={{ marginTop: 18 }}>Payment received!</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: 6 }}>₹{amount} for order {qr?.orderId}</p>
            <button className="btn btn-primary" style={{ marginTop: 22 }} onClick={reset}>New bill</button>
          </div>
        )}
      </div>
    </div>
  );
}

const spinnerStyle = {
  width: 28, height: 28, margin: '20px auto 0',
  border: '3px solid var(--brand-light)', borderTopColor: 'var(--brand)',
  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
};

const successCircle = {
  width: 72, height: 72, borderRadius: '50%', background: 'var(--success)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto',
};
