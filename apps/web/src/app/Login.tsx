import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthContext';
import { Icon } from './Icon';
import { ThemeToggle } from './ThemeContext';

export function Login() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(identifier, password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-lockup brand-lockup-light">
          <div className="brand-mark"><img src="/caltrack-mark.svg" alt="" /></div>
          <div><strong>CalTrack</strong><small>Procurement intelligence</small></div>
        </div>
        <div className="login-story">
          <span className="eyebrow eyebrow-light">PUBLIC SECTOR · TECHNOLOGY</span>
          <h1>Public-sector bids. One clear workspace.</h1>
          <p>A focused workspace for collecting, qualifying, and managing technology solicitations.</p>
        </div>
        <div className="login-proof">
          <div><Icon name="trend" /><span><strong>Find relevant RFOs</strong><small>High-value technology opportunities, ranked for review</small></span></div>
          <div><Icon name="database" /><span><strong>Move bids forward</strong><small>Research, notes, decisions, and deadlines in one place</small></span></div>
        </div>
        <div className="california-outline" aria-hidden="true">CA</div>
      </section>
      <section className="login-panel">
        <div className="login-theme"><ThemeToggle /></div>
        <form className="login-card" onSubmit={submit}>
          <div className="mobile-brand brand-lockup">
            <div className="brand-mark"><img src="/caltrack-mark.svg" alt="" /></div>
            <div><strong>CalTrack</strong><small>Procurement intelligence</small></div>
          </div>
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your workspace</h2>
          <p>Review new matches and stay ahead of upcoming procurement deadlines.</p>
          <label>Username<input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} /></label>
          <label>Password
            <div className="password-wrap">
              <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password}
                onChange={(event) => setPassword(event.target.value)} />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>
          </label>
          {error && <div className="form-error"><Icon name="info" />{error}</div>}
          <button className="button button-primary button-large" disabled={busy}>
            {busy ? <span className="spinner" /> : null}{busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="local-note"><Icon name="shield" size={16} /> Secure access to your procurement workspace</div>
        </form>
      </section>
    </main>
  );
}
