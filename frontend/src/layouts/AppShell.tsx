import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from '../components/ui';
import { DASHBOARD_MODULES } from '../config/modules';

export function AppShell() {
  const { user, logout, hasAnyPermission } = useAuth();
  const navigate = useNavigate();

  const modules = DASHBOARD_MODULES.filter((module) =>
    hasAnyPermission(module.permissions),
  );

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">IMP</span>
          <div>
            <strong>Interview Hub</strong>
            <p>Management Platform</p>
          </div>
        </div>

        <nav className="nav">
          {modules.map((module) => (
            <NavLink
              key={module.id}
              to={module.path}
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
            >
              {module.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>
              {user?.firstName} {user?.lastName}
            </strong>
            <span>{user?.role}</span>
          </div>
          <ThemeToggle />
          <button type="button" className="ghost-btn" onClick={() => void onLogout()}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
