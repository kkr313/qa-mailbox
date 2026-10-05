import { useEffect, useState } from 'react';
import { api, token } from './api.js';
import Login from './components/Login.jsx';
import Mailbox from './components/Mailbox.jsx';
import AllMailbox from './components/AllMailbox.jsx';
import NotFound from './components/NotFound.jsx';

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const isAllMailbox = pathname === '/all';
  const isKnownRoute = pathname === '/' || isAllMailbox;
  const requestedPath = pathname === '/not-found'
    ? new URLSearchParams(window.location.search).get('path') || pathname
    : window.location.pathname;
  const [user, setUser] = useState(null);
  const [mailbox, setMailbox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState('');

  useEffect(() => {
    if (!isKnownRoute) return;
    api.health().then((data) => setMailbox(data.mailbox)).catch(() => {});
  }, [isKnownRoute]);

  useEffect(() => {
    if (!isKnownRoute) return;
    const hadToken = Boolean(token.get());
    api
      .me()
      .then((data) => {
        setUser(data.user);
        setAuthNotice('');
      })
      .catch((err) => {
        token.clear();
        if (isAllMailbox && err.status === 401) {
          setAuthNotice(hadToken ? 'Your session expired. Sign in again to view all generated emails.' : 'Sign in to view all generated emails.');
        }
      })
      .finally(() => setLoading(false));
  }, [isAllMailbox, isKnownRoute]);

  function handleLogin(nextUser) {
    setAuthNotice('');
    setUser(nextUser);
  }

  function handleLogout() {
    api.logout().catch(() => {});
    token.clear();
    setUser(null);
    setAuthNotice('');
  }

  function handleUnauthorized() {
    api.logout().catch(() => {});
    token.clear();
    setUser(null);
    setAuthNotice('Your session expired. Sign in again to view all generated emails.');
  }

  if (!isKnownRoute) return <NotFound path={requestedPath} />;
  if (loading) return <div className="boot">Loading…</div>;
  if (!user) return <Login onLogin={handleLogin} notice={authNotice} />;
  if (isAllMailbox) return <AllMailbox onLogout={handleLogout} onUnauthorized={handleUnauthorized} />;
  return <Mailbox user={user} mailbox={mailbox} onLogout={handleLogout} />;
}
