import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { Bell, LogOut, Menu, User, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { NAV, ROLE_LABEL } from './navigation';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // Close the mobile menu after navigating
  useEffect(() => setOpen(false), [location.pathname]);

  // Poll the unread counter for the bell
  useEffect(() => {
    let active = true;
    const load = () => api.get('/notifications/unread-count').then((r) => active && setUnread(r.data.unread)).catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [location.pathname]);

  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">H</span>
          <div>
            <strong>Hostel Management</strong>
            <small>{ROLE_LABEL[user.role]}</small>
          </div>
        </div>
        <nav>
          {NAV[user.role].map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} />
              <span>{label}</span>
              {to === '/notifications' && unread > 0 && <em className="nav-count">{unread > 99 ? '99+' : unread}</em>}
            </NavLink>
          ))}
        </nav>
        <button className="nav-link nav-logout" onClick={logout}><LogOut size={18} /><span>Sign out</span></button>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="topbar-right">
            <Link to="/notifications" className="icon-btn bell" aria-label={`Notifications, ${unread} unread`}>
              <Bell size={19} />
              {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
            </Link>
            <Link to="/profile" className="user-chip" title="My profile">
              <span className="avatar">{initials}</span>
              <span className="user-meta"><strong>{user.name}</strong><small>{user.email}</small></span>
            </Link>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
