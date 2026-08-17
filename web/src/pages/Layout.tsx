import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const MENU = [
  { to: '/', label: 'Dashboard' },
  { to: '/whatsapp', label: 'WhatsApp' },
  { to: '/groups', label: 'Groups' },
  { to: '/applications', label: 'Applications' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">WA SERVICE</div>
        <nav>
          {MENU.map((m) => (
            <NavLink key={m.to} to={m.to} end={m.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="logout">
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Logout
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}