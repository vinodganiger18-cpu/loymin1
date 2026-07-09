import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';

import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/customer/Dashboard';
import ShopList from './pages/customer/ShopList';
import ShopDetail from './pages/customer/ShopDetail';
import Scan from './pages/customer/Scan';
import Rewards from './pages/customer/Rewards';
import Profile from './pages/customer/Profile';
import ShopkeeperShell from './pages/shopkeeper/ShopkeeperShell';
import AdminShell from './pages/admin/AdminShell';

function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={roleHome(user.role)} replace />;
  return children;
}

function roleHome(role) {
  if (role === 'admin') return '/admin';
  if (role === 'shopkeeper') return '/shopkeeper';
  return '/';
}

function SplashScreen() {
  return (
    <div className="page-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 48, height: 48, border: '3px solid var(--brand-light)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Customer */}
      <Route path="/" element={<Protected role="customer"><Dashboard /></Protected>} />
      <Route path="/shops" element={<Protected role="customer"><ShopList /></Protected>} />
      <Route path="/shops/:id" element={<Protected role="customer"><ShopDetail /></Protected>} />
      <Route path="/scan" element={<Protected role="customer"><Scan /></Protected>} />
      <Route path="/rewards" element={<Protected role="customer"><Rewards /></Protected>} />
      <Route path="/profile" element={<Protected role="customer"><Profile /></Protected>} />

      {/* Shopkeeper */}
      <Route path="/shopkeeper" element={<Protected role="shopkeeper"><ShopkeeperShell /></Protected>} />

      {/* Admin */}
      <Route path="/admin" element={<Protected role="admin"><AdminShell /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
