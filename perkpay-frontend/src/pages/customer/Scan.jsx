import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';
import BottomNav from '../../components/BottomNav';
import TopBar from '../../components/TopBar';

const SCANNER_ID = 'qr-scanner-region';
const PENDING_KEY = 'perkpay_pending_order';

// Extracts our order ref from a standard UPI deep link, e.g.
// upi://pay?pa=shop@bank&pn=Shop&am=500.00&cu=INR&tr=ORD123abc&tn=...
function extractOrderId(decodedText) {
  try {
    const url = new URL(decodedText.replace('upi://', 'https://dummy/'));
    return url.searchParams.get('tr');
  } catch {
    return null;
  }
}

function savePending(data) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(data));
}
function loadPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; }
}
function clearPending() {
  localStorage.removeItem(PENDING_KEY);
}

export default function Scan() {
  const { user, refreshUser } = useAuth();
  // scanning | review | opening | confirming | done | error | restoring
  const [phase, setPhase] = useState('restoring');
  const [order, setOrder] = useState(null);
  const [applyRewards, setApplyRewards] = useState(false);
  const [upiLink, setUpiLink] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const scannerRef = useRef(null);

  // On mount: if we navigated away to a UPI app and the browser reloaded
  // this page on return, restore the "confirm payment" screen instead of
  // silently dropping back to the scanner (this was the bug where the
  // shopkeeper's screen never flipped to green — the customer never got
  // back to the confirm button because their state was lost).
  useEffect(() => {
    const pending = loadPending();
    if (!pending) { setPhase('scanning'); return; }

    api.paymentStatus(pending.orderId).then((status) => {
      if (['success', 'partial_paid', 'reward_paid'].includes(status.status)) {
        clearPending();
        setResult({
          earnedPoints: status.earnedPoints,
          shopBalance: status.shopBalance,
          shopName: status.shopName || pending.shopName,
        });
        setPhase('done');
      } else if (status.status === 'pending') {
        setUpiLink(pending.upiLink);
        setRemaining(pending.remaining);
        setOrder({ orderId: pending.orderId, shopName: pending.shopName });
        setPhase('opening');
      } else {
        clearPending();
        setPhase('scanning');
      }
    }).catch(() => { clearPending(); setPhase('scanning'); });
  }, []);

  useEffect(() => {
    if (phase !== 'scanning') return;
    const scanner = new Html5Qrcode(SCANNER_ID);
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 240 },
      async (decodedText) => {
        await scanner.stop().catch(() => {});
        handleScanned(decodedText);
      },
      () => {} // ignore per-frame scan failures
    ).catch(() => setError('Camera access denied. Enable camera permissions to scan.'));

    return () => { scanner.stop().catch(() => {}); };
  }, [phase]);

  async function handleScanned(decodedText) {
    const orderId = extractOrderId(decodedText);
    if (!orderId) {
      setError('This QR code doesn\u2019t look like a PerkPay bill. Ask the shopkeeper to generate a new one.');
      setPhase('error');
      return;
    }
    try {
      const data = await api.initiateOrder(orderId);
      setOrder(data);
      setPhase('review');
    } catch (err) {
      setError(err.message);
      setPhase('error');
    }
  }

  async function handleContinue() {
    setError('');
    try {
      const data = await api.lockAmount(order.orderId, applyRewards);

      // Fully paid with reward points — no UPI app needed at all.
      if (data.success) {
        await refreshUser();
        setResult(data);
        setPhase('done');
        return;
      }

      setUpiLink(data.upiLink);
      setRemaining(data.remaining);
      setPhase('opening');
      // Persist BEFORE navigating away — many mobile browsers reload or
      // unload the page when handing off to a upi:// custom scheme, which
      // would otherwise wipe this in-memory state.
      savePending({ orderId: order.orderId, shopName: order.shopName, upiLink: data.upiLink, remaining: data.remaining });
      window.location.href = data.upiLink;
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleConfirm() {
    setPhase('confirming');
    setError('');
    try {
      const data = await api.confirmPayment(order.orderId);
      clearPending();
      await refreshUser();
      setResult(data);
      setPhase('done');
    } catch (err) {
      setError(err.message);
      setPhase('opening');
    }
  }

  if (phase === 'restoring') {
    return (
      <div className="page-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--brand-light)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (phase === 'scanning') {
    return (
      <div className="page-container">
        <TopBar title="Scan to pay" />
        <div className="scroll-area" style={{ paddingTop: 0 }}>
          <div id={SCANNER_ID} style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)' }} />
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, marginTop: 16 }}>
            Point your camera at the shopkeeper's QR code.
          </p>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="page-container">
        <TopBar title="Scan to pay" />
        <div className="scroll-area" style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: 40 }}>⚠</p>
          <p style={{ color: 'var(--danger)', marginTop: 12, fontWeight: 600 }}>{error}</p>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => { setError(''); setPhase('scanning'); }}>
            Scan again
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="page-container">
        <TopBar title="Payment successful" />
        <div className="scroll-area" style={{ textAlign: 'center', paddingTop: 50 }}>
          <div style={successCircle}>✓</div>
          <h2 style={{ marginTop: 20 }}>Payment received!</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 6 }}>at {result?.shopName || order?.shopName}</p>

          <div className="card" style={{ padding: 18, marginTop: 22, textAlign: 'left' }}>
            <Row label="Points earned this visit" value={`+${result?.earnedPoints ?? 0}`} highlight bold />
            <Row label={`Your ${result?.shopName || order?.shopName} balance`} value={`${result?.shopBalance ?? 0} pts`} bold />
            <Row label="Total coins earned (lifetime)" value={`${user?.points_balance ?? 0}`} />
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 14 }}>
            These points can only be redeemed at {result?.shopName || order?.shopName}.
          </p>

          <button className="btn btn-primary" style={{ marginTop: 22 }} onClick={() => { setResult(null); setPhase('scanning'); }}>
            Scan another
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (phase === 'opening' || phase === 'confirming') {
    return (
      <div className="page-container">
        <TopBar title="Complete payment" />
        <div className="scroll-area" style={{ textAlign: 'center', paddingTop: 40 }}>
          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pay via UPI app</p>
            <h1 style={{ fontSize: 32, marginTop: 6 }}>₹{remaining}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>to {order.shopName}</p>
          </div>

          <a href={upiLink} className="btn btn-secondary btn-block" style={{ marginTop: 16 }}>
            Open UPI app again
          </a>

          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 20 }}>
            Once your UPI app confirms the payment, come back here and tap below.
          </p>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} disabled={phase === 'confirming'} onClick={handleConfirm}>
            {phase === 'confirming' ? 'Confirming…' : "I've completed the payment"}
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  // review phase
  const previewRemaining = order ? (applyRewards ? order.amount - order.maxDiscount : order.amount) : 0;

  return (
    <div className="page-container">
      <TopBar title="Confirm payment" />
      <div className="scroll-area" style={{ paddingTop: 0 }}>
        <div className="card" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Paying to</p>
          <h2 style={{ marginTop: 4 }}>{order.shopName}</h2>
          <p style={{ fontSize: 32, fontWeight: 700, marginTop: 14 }}>₹{order.amount}</p>
        </div>

        {order.maxDiscount > 0 && (
          <div className="card" style={{ padding: 16, marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: 14.5 }}>Use my points</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 2 }}>
                Save up to ₹{order.maxDiscount} · you have {order.customerPoints} pts
              </p>
            </div>
            <input type="checkbox" checked={applyRewards} onChange={(e) => setApplyRewards(e.target.checked)} style={{ width: 22, height: 22 }} />
          </div>
        )}

        <div className="card" style={{ padding: 16, marginTop: 14 }}>
          <Row label="Bill amount" value={`₹${order.amount}`} />
          {applyRewards && <Row label="Reward discount" value={`− ₹${order.maxDiscount}`} highlight />}
          <Row label="Amount to pay via UPI" value={`₹${previewRemaining}`} bold />
        </div>

        {error && <p className="error-text">{error}</p>}

        <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleContinue}>
          {previewRemaining === 0 ? 'Pay with points' : `Continue to pay ₹${previewRemaining}`}
        </button>
      </div>
      <BottomNav />
    </div>
  );
}

function Row({ label, value, bold, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: bold ? 700 : 600, color: highlight ? 'var(--success)' : 'var(--text)' }}>{value}</span>
    </div>
  );
}

const successCircle = {
  width: 72, height: 72, borderRadius: '50%', background: 'var(--success)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto',
};
