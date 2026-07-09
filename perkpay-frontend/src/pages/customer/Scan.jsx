import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';
import BottomNav from '../../components/BottomNav';
import TopBar from '../../components/TopBar';

const SCANNER_ID = 'qr-scanner-region';

// Extracts our order ref from the PerkPay QR, e.g. perkpay://pay?order=ORD123
function extractOrderId(decodedText) {
  try {
    const url = new URL(decodedText.replace('perkpay://', 'https://dummy/'));
    return url.searchParams.get('order');
  } catch {
    return null;
  }
}

export default function Scan() {
  const { user, refreshUser } = useAuth();
  // scanning | review | paying | confirming | done | error
  const [phase, setPhase] = useState('scanning');
  const [order, setOrder] = useState(null);
  const [applyRewards, setApplyRewards] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const scannerRef = useRef(null);

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
      setError('This QR code doesn’t look like a PerkPay bill. Ask the shopkeeper to generate a new one.');
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

  // Poll the server (webhook-driven) until the transaction is settled.
  async function waitForSettlement(orderId, shopNameFallback) {
    setPhase('confirming');
    const deadline = Date.now() + 90_000; // give up after 90s
    while (Date.now() < deadline) {
      try {
        const status = await api.paymentStatus(orderId);
        if (['success', 'partial_paid', 'reward_paid'].includes(status.status)) {
          await refreshUser();
          setResult({
            earnedPoints: status.earnedPoints,
            shopBalance: status.shopBalance,
            shopName: status.shopName || shopNameFallback,
          });
          setPhase('done');
          return;
        }
        if (status.status === 'failed' || status.status === 'expired') {
          setError('Payment failed or the bill expired.');
          setPhase('review');
          return;
        }
      } catch { /* transient — keep polling */ }
      await new Promise((r) => setTimeout(r, 2500));
    }
    // Still not settled — payment may still confirm; tell the user gently.
    setError('We haven’t received confirmation yet. If money was deducted, your points will appear shortly.');
    setPhase('review');
  }

  async function handleContinue() {
    setError('');
    try {
      const data = await api.lockAmount(order.orderId, applyRewards);

      // Fully covered by reward points — server already settled it.
      if (data.fullyPaidByRewards) {
        await refreshUser();
        setResult(data);
        setPhase('done');
        return;
      }

      // Open Razorpay Checkout for the remaining amount.
      if (!window.Razorpay) {
        setError('Payment SDK failed to load. Check your connection and try again.');
        return;
      }
      setPhase('paying');
      const rzp = new window.Razorpay({
        key: data.razorpayKeyId,
        order_id: data.razorpayOrderId,
        amount: data.amountPaise,
        currency: 'INR',
        name: data.shopName,
        description: `Bill at ${data.shopName}`,
        prefill: { name: user?.name, email: user?.email },
        theme: { color: '#7c3aed' },
        handler() {
          // Payment submitted — settlement is confirmed server-side via webhook.
          waitForSettlement(order.orderId, data.shopName);
        },
        modal: {
          ondismiss() {
            setPhase('review');
            setError('Payment cancelled.');
          },
        },
      });
      rzp.on('payment.failed', () => {
        setPhase('review');
        setError('Payment failed. Please try again.');
      });
      rzp.open();
    } catch (err) {
      setError(err.message);
    }
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

  if (phase === 'paying' || phase === 'confirming') {
    return (
      <div className="page-container">
        <TopBar title="Complete payment" />
        <div className="scroll-area" style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ width: 48, height: 48, margin: '0 auto', border: '3px solid var(--brand-light)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: 'var(--text-muted)', marginTop: 20 }}>
            {phase === 'confirming' ? 'Confirming your payment…' : 'Waiting for you to complete payment…'}
          </p>
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
          <Row label="Amount to pay" value={`₹${previewRemaining}`} bold />
        </div>

        {error && <p className="error-text">{error}</p>}

        <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleContinue}>
          {previewRemaining === 0 ? 'Pay with points' : `Pay ₹${previewRemaining}`}
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
