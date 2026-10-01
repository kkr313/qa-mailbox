import { useCallback, useEffect, useRef, useState } from 'react';
import { api, token } from '../api.js';
import AliasManager from './AliasManager.jsx';
import CopyButton from './CopyButton.jsx';

const REFRESH_MS = 10000;
const ALIAS_PATTERN = /^[a-z0-9][a-z0-9._-]{0,30}$/;
const ENVIRONMENTS = [
  { value: 'dev', short: 'D', label: 'Development' },
  { value: 'stage', short: 'S', label: 'Stage' },
  { value: 'nonprod', short: 'NP', label: 'Non-production' },
  { value: 'prod', short: 'P', label: 'Production' },
];
const RANDOM_NAMES = {
  animal: ['falcon', 'panda', 'otter', 'tiger', 'koala', 'robin', 'dolphin', 'rabbit'],
  food: ['mango', 'cocoa', 'olive', 'berry', 'taco', 'peach', 'bagel', 'cherry'],
  nature: ['river', 'maple', 'ocean', 'cedar', 'meadow', 'cloud', 'stone', 'sunrise'],
  people: ['alex', 'maya', 'noah', 'emma', 'liam', 'zoe', 'arjun', 'priya'],
};

function storageKey(username) {
  return `qa-mailbox-aliases:${username}`;
}

function openedStorageKey(username) {
  return `qa-mailbox-opened:${username}`;
}

function loadAliases(username) {
  try {
    const raw = localStorage.getItem(storageKey(username));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadOpenedMessages(username) {
  try {
    const raw = localStorage.getItem(openedStorageKey(username));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function randomAlias() {
  const categories = Object.keys(RANDOM_NAMES);
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const firstCategoryIndex = bytes[0] % categories.length;
  const secondCategoryIndex = (firstCategoryIndex + 1 + (bytes[1] % (categories.length - 1))) % categories.length;
  const firstList = RANDOM_NAMES[categories[firstCategoryIndex]];
  const secondList = RANDOM_NAMES[categories[secondCategoryIndex]];
  const firstWord = firstList[bytes[2] % firstList.length];
  const secondWord = secondList[bytes[3] % secondList.length];
  const suffix = 10 + (bytes[4] % 90);
  return `${firstWord}_${secondWord}_${suffix}`;
}

function normalizeAliasInput(value, mailboxLocal, mailboxDomain) {
  let normalized = String(value || '').trim().toLowerCase();
  const fullEmail = new RegExp(`^${mailboxLocal}\\+(.+)@${mailboxDomain.replace('.', '\\.')}$$`, 'i').exec(normalized);
  if (fullEmail) normalized = fullEmail[1];

  return normalized
    .replace(/^(dev|stage|nonprod|prod)[_-]/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .replace(/[._-]{2,}/g, '_');
}

function formatDate(iso) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return date.toLocaleString(undefined, {
    month: sameDay ? undefined : 'short',
    day: sameDay ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildHtmlDoc(html) {
  if (!html) return '';
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body>${html}</body></html>`;
}

function HighlightMatch({ text, query }) {
  const value = String(text || '');
  const needle = query.trim();
  if (!needle) return value;

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = value.split(new RegExp(`(${escaped})`, 'ig'));
  return parts.map((part, index) =>
    part.toLowerCase() === needle.toLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : part
  );
}

export default function Mailbox({ user, mailbox, onLogout }) {
  const [aliases, setAliases] = useState(() => loadAliases(user.username));
  const [openedMessageIds, setOpenedMessageIds] = useState(() => loadOpenedMessages(user.username));
  const [draftAlias, setDraftAlias] = useState('');
  const [selectedEnvironment, setSelectedEnvironment] = useState('dev');
  const [aliasError, setAliasError] = useState('');
  const [selectedAlias, setSelectedAlias] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(search);
  searchRef.current = search;

  const [local, domain] = (mailbox || 'only4qause@gmail.com').split('@');
  const aliasEmail = selectedAlias ? `${local}+${selectedAlias}@${domain}` : '';
  const smartSearch = searchRef.current.trim().length > 0;
  const normalizedDraft = normalizeAliasInput(draftAlias, local, domain);
  const draftEnvironmentAlias = normalizedDraft ? `${selectedEnvironment}_${normalizedDraft}` : '';
  const draftEmail = draftEnvironmentAlias ? `${local}+${draftEnvironmentAlias}@${domain}` : '';
  const aliasExists = aliases.some((alias) => alias.toLowerCase() === draftEnvironmentAlias.toLowerCase());

  useEffect(() => {
    setAliases(loadAliases(user.username));
  }, [user.username]);

  useEffect(() => {
    localStorage.setItem(storageKey(user.username), JSON.stringify(aliases));
  }, [aliases, user.username]);

  useEffect(() => {
    localStorage.setItem(openedStorageKey(user.username), JSON.stringify([...openedMessageIds]));
  }, [openedMessageIds, user.username]);

  useEffect(() => {
    if (!selectedAlias && aliases.length) setSelectedAlias(aliases[0]);
  }, [aliases, selectedAlias]);

  function addAlias(name) {
    const baseName = normalizeAliasInput(name, local, domain);
    const alias = `${selectedEnvironment}_${baseName}`;
    if (!ALIAS_PATTERN.test(alias)) {
      setAliasError('Alias with environment must use valid characters and be 31 characters or fewer.');
      return;
    }
    const existingAlias = aliases.find((item) => item.toLowerCase() === alias.toLowerCase());
    if (existingAlias) {
      setAliasError(`${local}+${existingAlias}@${domain} already exists.`);
      setSelectedAlias(existingAlias);
      return;
    }
    setAliasError('');
    setAliases((prev) => [alias, ...prev]);
    setSelectedAlias(alias);
    setDraftAlias('');
  }

  function removeAlias(alias) {
    setAliases((prev) => prev.filter((a) => a !== alias));
    if (selectedAlias === alias) setSelectedAlias(null);
  }

  function handleCreateAlias(event) {
    event.preventDefault();
    if (draftAlias.trim()) addAlias(draftAlias);
  }

  function handleGenerateAlias() {
    let candidate = randomAlias();
    while (aliases.some((alias) => alias.toLowerCase() === `${selectedEnvironment}_${candidate}`.toLowerCase())) {
      candidate = randomAlias();
    }
    addAlias(candidate);
  }

  const load = useCallback(
    async ({ silent } = {}) => {
      if (!selectedAlias && !smartSearch) {
        setMessages([]);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const data = await api.messages(selectedAlias, searchRef.current, smartSearch);
        setMessages(data.messages);
        setError('');
      } catch (err) {
        if (err.status === 401) {
          token.clear();
          onLogout();
          return;
        }
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [onLogout, selectedAlias, smartSearch]
  );

  useEffect(() => {
    const timer = setTimeout(() => load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [search, load]);

  useEffect(() => {
    setSelectedId(null);
  }, [selectedAlias]);

  useEffect(() => {
    if (selectedId && !messages.some((message) => message.id === selectedId)) setSelectedId(null);
  }, [messages, selectedId]);

  useEffect(() => {
    function autoRefresh() {
      if (document.visibilityState === 'visible') load({ silent: true });
    }

    const interval = setInterval(autoRefresh, REFRESH_MS);
    document.addEventListener('visibilitychange', autoRefresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', autoRefresh);
    };
  }, [load]);

  const selected = messages.find((m) => m.id === selectedId) || null;
  const discoveredAliases = smartSearch
    ? [...new Set(messages.flatMap((message) => message.recipientAliases || []))]
    : [];

  function openMessage(messageId) {
    setSelectedId(messageId);
    setOpenedMessageIds((current) => {
      if (current.has(messageId)) return current;
      const next = new Set(current);
      next.add(messageId);
      return next;
    });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">QA</span>
          <div>
            <h1>QA Mailbox</h1>
            <div className="header-lane">
              <div className="alias">
                <span className="alias-text" title={aliasEmail || 'Pick or create an alias to get started'}>
                  {aliasEmail || 'Pick or create an alias to get started'}
                </span>
                {aliasEmail && <CopyButton value={aliasEmail} label="Copy" />}
                <span className="alias-toolbar">
                  <span className="environment-picker" role="group" aria-label="Environment">
                    {ENVIRONMENTS.map((environment) => (
                      <button
                        key={environment.value}
                        type="button"
                        className={`environment-option${selectedEnvironment === environment.value ? ' active' : ''}`}
                        onClick={() => setSelectedEnvironment(environment.value)}
                        aria-pressed={selectedEnvironment === environment.value}
                        title={environment.label}
                      >
                        {environment.short}
                      </button>
                    ))}
                  </span>
                  <form className="alias-toolbar-form" onSubmit={handleCreateAlias}>
                    <input
                      value={draftAlias}
                      onChange={(e) => {
                        setDraftAlias(e.target.value);
                        setAliasError('');
                      }}
                      placeholder="e.g. payment_reset"
                      aria-label="New alias name"
                    />
                    <button className="ghost small" type="submit" disabled={!normalizedDraft || aliasExists}>
                      Add
                    </button>
                  </form>
                  <button className="ghost small random-alias-btn" type="button" onClick={handleGenerateAlias} title="Generate random alias">
                    Random
                  </button>
                </span>
              </div>

              <div className="topbar-actions">
                <div className="search-control">
                  <input
                    className="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by alias, full email, or title…"
                    aria-label="Search emails"
                    disabled={!selectedAlias && !smartSearch}
                  />
                  {search && (
                    <button className="search-clear" type="button" onClick={() => setSearch('')} aria-label="Clear search">
                      ×
                    </button>
                  )}
                </div>
                <button
                  className={`ghost action-btn refresh-btn${loading ? ' is-loading' : ''}`}
                  onClick={() => load()}
                  disabled={loading || (!selectedAlias && !smartSearch)}
                  aria-busy={loading}
                  title="Auto-refreshes every 10 seconds"
                >
                  Refresh
                </button>
                <button className="ghost action-btn logout-btn" onClick={onLogout}>
                  Logout
                </button>
              </div>
            </div>
            {aliasExists && <p className="error alias-error">{draftEmail} already exists.</p>}
            {!aliasExists && aliasError && <p className="error alias-error">{aliasError}</p>}
          </div>
        </div>
      </header>

      {error && <p className="error banner">{error}</p>}

      <main className="layout">
        <AliasManager
          aliases={aliases}
          discoveredAliases={discoveredAliases}
          mailboxLocal={local}
          mailboxDomain={domain}
          selectedAlias={selectedAlias}
          searchQuery={search}
          onSelect={setSelectedAlias}
          onRemove={removeAlias}
        />

        <section className="list" aria-label="Messages">
          <h3 className="panel-title">Incoming Emails</h3>
          <div className="panel-body">
            {!selectedAlias && !smartSearch && (
              <div className="empty-group">
                <p className="empty">No alias selected.</p>
                <p className="empty-sub">Create or select an alias to open mailbox.</p>
              </div>
            )}
            {(selectedAlias || smartSearch) && !loading && messages.length === 0 && (
              <div className="empty-group">
                <p className="empty">No emails found.</p>
                {selectedAlias && !search.trim() && <p className="empty-hint">{aliasEmail}</p>}
              </div>
            )}
            {messages.map((message) => {
              const recipientEmail = message.recipientAliases?.[0]
                ? `${local}+${message.recipientAliases[0]}@${domain}`
                : message.to;
              const unopened = !openedMessageIds.has(message.id);
              return (
                <button
                  key={message.id}
                  className={`list-item${message.id === selectedId ? ' active' : ''}${unopened ? ' unopened' : ''}`}
                  onClick={() => openMessage(message.id)}
                >
                  <div className="row">
                    <span className="sender-wrap">
                      {unopened && <span className="unopened-dot" aria-label="Unopened" />}
                      <span className="sender">{message.from.name}</span>
                    </span>
                    <span className="date">{formatDate(message.date)}</span>
                  </div>
                  <div className="subject">{message.subject}</div>
                  <div className="snippet">{message.snippet}</div>
                  {smartSearch && recipientEmail && (
                    <div className="to-alias">
                      To: <HighlightMatch text={recipientEmail} query={search} />
                    </div>
                  )}
                  {message.otp && <span className="otp-chip">OTP {message.otp}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="detail" aria-label="Message">
          <div className="panel-title mailbox-panel-title">
            <h3>Mailbox</h3>
            {selected?.otp && (
              <div className="header-otp">
                <span className="header-otp-label">Detected OTP</span>
                <strong className="header-otp-value">{selected.otp}</strong>
                <CopyButton value={selected.otp} label="Copy" />
              </div>
            )}
          </div>
          <div className="panel-body">
            {!selected && (
              <div className="empty-group">
                <p className="empty">Select an email to read it.</p>
              </div>
            )}
            {selected && (
              <article>
                <h2>{selected.subject}</h2>
                <div className="meta">
                  <span>
                    <strong>{selected.from.name}</strong> &lt;{selected.from.email}&gt;
                  </span>
                  <span>{new Date(selected.date).toLocaleString()}</span>
                  <span>To: {selected.to}</span>
                </div>

                {selected.htmlBody ? (
                  <iframe
                    title="Email HTML preview"
                    className="body-frame"
                    sandbox="allow-popups allow-top-navigation-by-user-activation"
                    srcDoc={buildHtmlDoc(selected.htmlBody)}
                  />
                ) : (
                  <pre className="body">{selected.body}</pre>
                )}
              </article>
            )}
          </div>
        </section>
      </main>

      <footer className="app-footer">
        Made with <span aria-label="love">❤️</span> by{' '}
        <a href="https://sdet-karan.netlify.app/" target="_blank" rel="noreferrer">
          Karan
        </a>
      </footer>
    </div>
  );
}
