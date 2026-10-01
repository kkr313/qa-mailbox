import CopyButton from './CopyButton.jsx';

const ENVIRONMENT_LABELS = {
  dev: 'Development',
  stage: 'Stage',
  nonprod: 'Non-production',
  prod: 'Production',
};

function aliasEnvironment(alias) {
  const prefix = alias.match(/^(dev|stage|nonprod|prod)[_-]/)?.[1];
  return prefix ? ENVIRONMENT_LABELS[prefix] : 'General';
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

export default function AliasManager({
  aliases = [],
  discoveredAliases = [],
  mailboxLocal = 'only4qause',
  mailboxDomain = 'gmail.com',
  selectedAlias = null,
  searchQuery = '',
  onSelect = () => {},
  onRemove = () => {},
}) {
  const allAliases = [...new Set([...aliases, ...discoveredAliases])];
  const needle = searchQuery.trim().toLowerCase();
  const matchingAliases = needle
    ? allAliases.filter((alias) => {
        const email = `${mailboxLocal}+${alias}@${mailboxDomain}`;
        const environment = aliasEnvironment(alias);
        return [alias, email, environment].some((value) => value.toLowerCase().includes(needle));
      })
    : [];
  const visibleAliases = matchingAliases.length ? matchingAliases : aliases;

  return (
    <aside className="alias-controls" aria-label="Generated emails">
      <h3 className="panel-title">Generated Emails</h3>
      <div className={`panel-body alias-list${!visibleAliases.length ? ' is-empty' : ''}`}>
        {!visibleAliases.length && <p className="empty small">No generated emails yet.</p>}
        {visibleAliases.map((alias) => {
          const email = `${mailboxLocal}+${alias}@${mailboxDomain}`;
          const isSearchMatch = matchingAliases.includes(alias);
          const isSaved = aliases.includes(alias);
          return (
            <div
              key={alias}
              className={`alias-item${alias === selectedAlias ? ' active' : ''}${isSearchMatch ? ' search-match' : ''}${!isSaved ? ' discovered' : ''}`}
            >
              <button className="alias-select" onClick={() => onSelect(alias)}>
                <span className="alias-name"><HighlightMatch text={alias} query={searchQuery} /></span>
                <span className="alias-environment">
                  <HighlightMatch text={aliasEnvironment(alias)} query={searchQuery} />
                  {!isSaved && ' · Found in mailbox'}
                </span>
                <span className="alias-email"><HighlightMatch text={email} query={searchQuery} /></span>
              </button>
              <div className="alias-item-actions">
                <CopyButton value={email} label="Copy" />
                {isSaved && (
                  <button className="ghost small danger" onClick={() => onRemove(alias)} aria-label={`Remove ${alias}`}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
