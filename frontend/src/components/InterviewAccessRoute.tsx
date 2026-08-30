import { Outlet, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { guestSession } from '../lib/guestSession';

/**
 * Staff (logged in) OR candidate guest session for this interview id.
 */
export function InterviewAccessRoute() {
  const { id = '' } = useParams();
  const location = useLocation();
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return (
      <div className="boot-screen">
        <div className="boot-card">Loading…</div>
      </div>
    );
  }

  const guestOk = guestSession.isActiveFor(id);
  if (isAuthenticated || guestOk) {
    const guestLobby =
      guestOk && !isAuthenticated && location.pathname.includes('/lobby');
    return (
      <div className={guestLobby ? 'candidate-shell' : undefined}>
        <Outlet />
      </div>
    );
  }

  if (guestSession.getToken() && !guestOk) {
    guestSession.clear();
  }

  return (
    <div className="auth-page single">
      <div className="auth-form card">
        <h2>Session expired</h2>
        <p className="lede">
          Open your candidate invite link again to join the interview.
        </p>
      </div>
    </div>
  );
}
