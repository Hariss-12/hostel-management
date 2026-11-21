import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('hms_token'));

  const refresh = useCallback(async () => {
    const res = await api.get('/auth/me');
    setUser(res.data);
    return res.data;
  }, []);

  // Restore the session on page load
  useEffect(() => {
    if (!localStorage.getItem('hms_token')) return;
    refresh()
      .catch(() => localStorage.removeItem('hms_token'))
      .finally(() => setLoading(false));
  }, [refresh]);

  const login = async (identifier, password, role) => {
    const res = await api.post('/auth/login', { identifier, password, role });
    localStorage.setItem('hms_token', res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem('hms_token');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
