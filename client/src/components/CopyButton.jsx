import { useEffect, useState } from 'react';

export default function CopyButton({ value, label = 'Copy', primary = false }) {
  const [copied, setCopied] = useState(false);
  const widthCh = Math.max(label.length, 'Copied!'.length) + 1;

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={`${primary ? 'primary' : 'ghost'} small copy-btn${copied ? ' copied' : ''}`}
      onClick={handleCopy}
      style={{ minWidth: `${widthCh + 2}ch` }}
      aria-live="polite"
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}
