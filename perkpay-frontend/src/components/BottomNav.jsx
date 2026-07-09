import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/shops', label: 'Shops', icon: '⚑' },
  { to: '/scan', label: 'Scan', icon: '▣' },
  { to: '/rewards', label: 'Rewards', icon: '★' },
  { to: '/profile', label: 'Profile', icon: '◐' },
];

export default function BottomNav() {
  return (
    <nav style={styles.nav}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          style={({ isActive }) => ({
            ...styles.tab,
            color: isActive ? 'var(--brand)' : 'var(--text-faint)',
          })}
        >
          {({ isActive }) => (
            <>
              <span style={{
                ...styles.iconWrap,
                background: isActive ? 'var(--brand-light)' : 'transparent',
              }}>
                {tab.icon}
              </span>
              <span style={styles.label}>{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

const styles = {
  nav: {
    position: 'fixed',
    bottom: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    maxWidth: 480,
    display: 'flex',
    justifyContent: 'space-around',
    background: '#fff',
    borderTop: '1px solid var(--border)',
    padding: '8px 8px calc(8px + env(safe-area-inset-bottom))',
    zIndex: 50,
  },
  tab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
  },
  iconWrap: {
    width: 34,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    fontSize: 16,
  },
  label: {},
};
