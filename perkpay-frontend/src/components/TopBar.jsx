import { useNavigate } from 'react-router-dom';

export default function TopBar({ title, back, right }) {
  const navigate = useNavigate();
  return (
    <header style={styles.header}>
      {back ? (
        <button onClick={() => navigate(-1)} style={styles.backBtn} aria-label="Go back">←</button>
      ) : <span style={{ width: 32 }} />}
      <h2 style={styles.title}>{title}</h2>
      <div style={{ width: 32, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </header>
  );
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 20px 12px',
    background: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
  },
  backBtn: {
    width: 32, height: 32,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8,
    fontSize: 18,
    color: 'var(--text)',
  },
};
