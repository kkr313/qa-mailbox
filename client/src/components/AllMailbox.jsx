import { useEffect, useState } from 'react';
import { api, token } from '../api.js';
import CopyButton from './CopyButton.jsx';
import PageFooter from './PageFooter.jsx';

const PAGE_SIZE = 25;

function formatDate(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildHtmlDoc(html) {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body>${html}</body></html>`;
}

export default function AllMailbox({ onLogout, onUnauthorized }) {
  const [data, setData] = useState(null);
  const [selectedAlias, setSelectedAlias] = useState(null);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate] = useState('');
  const [currentPageToken, setCurrentPageToken] = useState('');
  const [previousPageTokens, setPreviousPageTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobilePane, setMobilePane] = useState('inbox');

  async function load({
    pageToken = currentPageToken,
    history = previousPageTokens,
    from = appliedFromDate,
    to = appliedToDate,
  } = {}) {
    setLoading(true);
    try {
      const result = await api.allMailbox({
        limit: PAGE_SIZE,
        pageToken,
        from,
        to,
        timezoneOffset: new Date().getTimezoneOffset(),
      });
      setData(result);
      const nextAlias = selectedAlias && result.aliases.some((group) => group.alias === selectedAlias)
        ? selectedAlias
        : result.aliases[0]?.alias || null;
      const nextGroup = result.aliases.find((item) => item.alias === nextAlias) || null;
      setSelectedAlias(nextAlias);
      setSelectedMessageId((current) => nextGroup?.messages.some((message) => message.id === current)
        ? current
        : nextGroup?.messages[0]?.id || null);
      setCurrentPageToken(pageToken);
      setPreviousPageTokens(history);
      setAppliedFromDate(from);
      setAppliedToDate(to);
      setError('');
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load({ pageToken: '', history: [], from: '', to: '' });
  }, []);

  const group = data?.aliases.find((item) => item.alias === selectedAlias) || null;
  const selectedMessage = group?.messages.find((message) => message.id === selectedMessageId) || null;

  function selectAlias(alias) {
    const nextGroup = data?.aliases.find((item) => item.alias === alias) || null;
    setSelectedAlias(alias);
    setSelectedMessageId(nextGroup?.messages[0]?.id || null);
    setMobilePane('inbox');
  }

  function selectMessage(messageId) {
    setSelectedMessageId(messageId);
    setMobilePane('message');
  }

  function applyDateFilter(event) {
    event.preventDefault();
    if (fromDate && toDate && fromDate > toDate) {
      setError('From date cannot be after To date.');
      return;
    }
    load({ pageToken: '', history: [], from: fromDate, to: toDate });
  }

  function clearDateFilter() {
    setFromDate('');
    setToDate('');
    load({ pageToken: '', history: [], from: '', to: '' });
  }

  function showPreviousPage() {
    const history = previousPageTokens.slice(0, -1);
    load({ pageToken: previousPageTokens.at(-1) || '', history });
  }

  function showNextPage() {
    load({
      pageToken: data.nextPageToken,
      history: [...previousPageTokens, currentPageToken],
    });
  }

  return (
    <div className="app all-mailbox">
      <header className="topbar all-mailbox-header">
        <div className="brand">
          <span className="brand-mark">QA</span>
          <div>
            <h1>All Generated Emails</h1>
            <p>
              {data ? `${data.aliases.length} aliases from ${data.scannedMessages} Gmail messages on this page` : 'Reading Gmail mailbox'}
            </p>
          </div>
        </div>
        <div className="all-mailbox-actions">
          <a className="ghost-link" href="/">Main mailbox</a>
          <button className={`ghost refresh-btn${loading ? ' is-loading' : ''}`} onClick={() => load()} disabled={loading}>
            Refresh
          </button>
          <button className="ghost" onClick={onLogout}>Logout</button>
        </div>
      </header>

      {error && <p className="error banner">{error}</p>}

      <form className="all-mailbox-filters" onSubmit={applyDateFilter}>
        <label className="date-filter-field">
          <span>From</span>
          <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label className="date-filter-field">
          <span>To</span>
          <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <button className="primary date-filter-apply" type="submit" disabled={loading}>Apply</button>
        <button className="ghost date-filter-clear" type="button" onClick={clearDateFilter} disabled={loading || (!fromDate && !toDate)}>
          Clear
        </button>
        {data && <span className="date-filter-summary">{data.resultSizeEstimate} matching Gmail messages</span>}
      </form>

      <nav className="mobile-pane-tabs" aria-label="Mailbox views">
        <button type="button" className={mobilePane === 'aliases' ? 'active' : ''} onClick={() => setMobilePane('aliases')}>Generated</button>
        <button type="button" className={mobilePane === 'inbox' ? 'active' : ''} onClick={() => setMobilePane('inbox')}>Inbox</button>
        <button type="button" className={mobilePane === 'message' ? 'active' : ''} onClick={() => setMobilePane('message')} disabled={!selectedMessage}>Message</button>
      </nav>

      <main className={`layout mobile-pane-${mobilePane}`}>
        <aside className="alias-controls" aria-label="Gmail aliases">
          <h3 className="panel-title">Generated Emails</h3>
          <div className={`panel-body alias-list${!data?.aliases.length ? ' is-empty' : ''}`}>
            {!loading && !data?.aliases.length && <p className="empty small">No aliases with incoming mail found.</p>}
            {data?.aliases.map((item) => (
              <div key={item.alias} className={`alias-item${item.alias === selectedAlias ? ' active' : ''}`}>
                <button className="alias-select" onClick={() => selectAlias(item.alias)}>
                  <span className="alias-name">{item.alias}</span>
                  <span className="alias-environment">{item.messageCount} {item.messageCount === 1 ? 'email' : 'emails'}</span>
                  <span className="alias-email">{item.email}</span>
                </button>
                <div className="alias-item-actions">
                  <CopyButton value={item.email} label="Copy" />
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="list" aria-label="Incoming emails">
          <h3 className="panel-title">Incoming Emails</h3>
          <div className="panel-body">
            {loading && <div className="empty-group"><p className="empty">Loading Gmail messages...</p></div>}
            {!loading && group && group.messages.length === 0 && <div className="empty-group"><p className="empty">No emails found.</p></div>}
            {group?.messages.map((message) => (
              <button
                key={message.id}
                className={`list-item${message.id === selectedMessageId ? ' active' : ''}`}
                onClick={() => selectMessage(message.id)}
              >
                <div className="row">
                  <span className="sender">{message.from.name}</span>
                  <span className="date">{formatDate(message.date)}</span>
                </div>
                <div className="subject">{message.subject}</div>
                <div className="snippet">{message.snippet}</div>
                {message.otp && <span className="otp-chip">OTP {message.otp}</span>}
              </button>
            ))}
          </div>
          <div className="mailbox-pagination" aria-label="Mailbox pages">
            <button className="ghost small" type="button" onClick={showPreviousPage} disabled={loading || previousPageTokens.length === 0}>
              Previous
            </button>
            <span>Page {previousPageTokens.length + 1}</span>
            <button className="ghost small" type="button" onClick={showNextPage} disabled={loading || !data?.nextPageToken}>
              Next
            </button>
          </div>
        </section>

        <section className="detail" aria-label="Message">
          <div className="panel-title mailbox-panel-title">
            <h3>Mailbox</h3>
            {selectedMessage?.otp && (
              <div className="header-otp">
                <span className="header-otp-label">Detected OTP</span>
                <strong className="header-otp-value">{selectedMessage.otp}</strong>
                <CopyButton value={selectedMessage.otp} label="Copy" />
              </div>
            )}
          </div>
          <div className="panel-body">
            {!selectedMessage && <div className="empty-group"><p className="empty">Select an email to read it.</p></div>}
            {selectedMessage && (
              <article>
                <h2>{selectedMessage.subject}</h2>
                <div className="meta">
                  <span><strong>{selectedMessage.from.name}</strong> &lt;{selectedMessage.from.email}&gt;</span>
                  <span>{new Date(selectedMessage.date).toLocaleString()}</span>
                  <span>To: {selectedMessage.to}</span>
                </div>
                {selectedMessage.htmlBody ? (
                  <iframe
                    title="Email HTML preview"
                    className="body-frame"
                    sandbox="allow-popups allow-top-navigation-by-user-activation"
                    srcDoc={buildHtmlDoc(selectedMessage.htmlBody)}
                  />
                ) : (
                  <pre className="body">{selectedMessage.body}</pre>
                )}
              </article>
            )}
          </div>
        </section>
      </main>
      <PageFooter />
    </div>
  );
}