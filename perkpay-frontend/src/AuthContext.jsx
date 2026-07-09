import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('perkpay_token');
    if (!token) { setLoading(false); return; }
    api.me()
      .then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem('perkpay_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { token, user } = await api.login({ email, password });
    localStorage.setItem('perkpay_token', token);
    setUser(user);
    return user;
  }

  async function signup(payload) {
    const { token, user } = await api.signup(payload);
    localStorage.setItem('perkpay_token', token);
    setUser(user);
    return user;
  }

  function logout() {
    localStorage.removeItem('perkpay_token');
    setUser(null);
  }

  function refreshUser() {
    return api.me().then(({ user }) => setUser(user));
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
