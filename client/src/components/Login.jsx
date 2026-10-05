import { useState } from 'react';
import { api, token } from '../api.js';
import PageFooter from './PageFooter.jsx';

export default function Login({ onLogin, notice = '' }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api.login(username, password);
      token.set(data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="brand">
          <span className="brand-mark">QA</span>
          <div>
            <h1>QA Mailbox</h1>
            <p>Shared QA login. Create your own alias after signing in.</p>
          </div>
        </div>

        {notice && <p className="login-notice" role="status">{notice}</p>}

        <label htmlFor="username">Username</label>
        <input
          id="username"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username"
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
        />

        {error && <p className="error">{error}</p>}

        <button className="primary" type="submit" disabled={busy || !username || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <PageFooter />
    </div>
  );
}
