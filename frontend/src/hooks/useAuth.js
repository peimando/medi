import { useState, useEffect } from "react";
import { apiFetch } from "./useApi";

export default function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const t = localStorage.getItem('mq_token');
      if (!t) return null;
      const p = JSON.parse(atob(t.split('.')[1]));
      if (p.exp * 1000 < Date.now()) { localStorage.removeItem('mq_token'); return null; }
      return p;
    } catch { return null; }
  });

  useEffect(() => {
    const h = () => setUser(null);
    window.addEventListener('auth:expired', h);
    return () => window.removeEventListener('auth:expired', h);
  }, []);

  const login = async (username, password) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    });
    localStorage.setItem('mq_token', data.token);
    const p = JSON.parse(atob(data.token.split('.')[1]));
    setUser(p); return p;
  };

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('mq_token');
    setUser(null);
  };

  const hasPermission = p => user && (user.permissions?.all || user.permissions?.[p]);
  return { user, login, logout, hasPermission, isAuthenticated: !!user };
}
