import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login, isAuthenticated, isBootstrapping } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';
  const presetEmail = searchParams.get('email') || 'hr@acme.com';
  const [email, setEmail] = useState(presetEmail);
  const [password, setPassword] = useState('Password@123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isBootstrapping) {
    return (
      <div className="boot-screen">
        <div className="boot-card">Loading…</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-visual" aria-hidden="true">
        <div className="auth-visual-inner">
          <p className="eyebrow">Interview Management Platform</p>
          <h1>Hire with clarity.</h1>
          <p>
            Authenticate once. Role-based access unlocks interviews, candidates,
            question banks, and reports.
          </p>
        </div>
      </div>

      <div className="auth-panel">
        <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="auth-heading">
            <span className="brand-mark sm">IMP</span>
            <h2>Sign in</h2>
            <p>Use your work email to continue.</p>
          </div>

          {error ? <div className="alert">{error}</div> : null}

          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="auth-meta">
            <Link to="/forgot-password">Forgot password?</Link>
          </p>

          <div className="demo-box">
            <strong>Demo accounts</strong>
            <span>hr@acme.com · interviewer@acme.com · candidate@acme.com</span>
            <span>Password: Password@123</span>
          </div>
        </form>
      </div>
    </div>
  );
}
