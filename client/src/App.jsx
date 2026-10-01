import { useEffect, useState } from 'react';
import { api, token } from './api.js';
import Login from './components/Login.jsx';
import Mailbox from './components/Mailbox.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [mailbox, setMailbox] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.health().then((data) => setMailbox(data.mailbox)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token.get()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((data) => setUser(data.user))
      .catch(() => token.clear())
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    token.clear();
    setUser(null);
  }

  if (loading) return <div className="boot">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <Mailbox user={user} mailbox={mailbox} onLogout={handleLogout} />;
}
