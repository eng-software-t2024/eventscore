import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function AppShell() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/events">
          <span className="brand-mark">ES</span>
          <span>EventScore</span>
        </Link>
        <div className="account-bar">
          <span className="account-email">{session?.user.email}</span>
          <button
            className="button button-quiet"
            onClick={() => void signOut().then(() => navigate('/login'))}
          >
            Sair
          </button>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
