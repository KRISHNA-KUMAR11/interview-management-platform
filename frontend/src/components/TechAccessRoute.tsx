import { Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { techGuestSession } from '../lib/techGuestSession';

/**
 * Staff (logged in) OR candidate tech-guest session for this assessment id.
 */
export function TechAccessRoute() {
  const { id = '' } = useParams();
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return (
      <div className="boot-screen">
        <div className="boot-card">Loading…</div>
      </div>
    );
  }

  const guestOk = techGuestSession.isActiveFor(id);
  if (isAuthenticated || guestOk) {
    return (
      <div className={guestOk && !isAuthenticated ? 'tech-exam-shell' : undefined}>
        <Outlet />
      </div>
    );
  }

  if (techGuestSession.getToken() && !guestOk) {
    techGuestSession.clear();
  }

  return (
    <div className="auth-page single">
      <div className="auth-form card">
        <h2>Session expired</h2>
        <p className="lede">
          Open your assessment invite link again to continue.
        </p>
      </div>
    </div>
  );
}
