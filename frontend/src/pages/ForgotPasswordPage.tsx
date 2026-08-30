import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const response = await authApi.forgotPassword(email.trim());
      const resetToken =
        response.data &&
        typeof response.data === 'object' &&
        'resetToken' in response.data
          ? String((response.data as { resetToken?: string }).resetToken ?? '')
          : '';
      setMessage(
        resetToken
          ? `${response.message} Dev reset token: ${resetToken}`
          : response.message,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page single">
      <form className="auth-form card" onSubmit={(e) => void onSubmit(e)}>
        <div className="auth-heading">
          <h2>Forgot password</h2>
          <p>We will send reset instructions if the account exists.</p>
        </div>

        {error ? <div className="alert">{error}</div> : null}
        {message ? <div className="alert success">{message}</div> : null}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <button type="submit" className="primary-btn" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>

        <p className="auth-meta">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}
