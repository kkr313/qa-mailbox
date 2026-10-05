import { config, httpError } from './config.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

let accessToken = null;
let accessTokenExpiry = 0;

export function gmailConfigured() {
  const { clientId, clientSecret, refreshToken } = config.google;
  return Boolean(clientId && clientSecret && refreshToken);
}

async function getAccessToken() {
  if (!gmailConfigured()) throw httpError(503, 'Gmail API is not configured. See README setup steps.');
  if (accessToken && Date.now() < accessTokenExpiry) return accessToken;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: config.google.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) throw httpError(502, 'Could not refresh Gmail access token.');
  const data = await res.json();
  accessToken = data.access_token;
  accessTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

async function gmailGet(path, params) {
  const token = await getAccessToken();
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    accessToken = null;
    throw httpError(502, 'Gmail rejected the stored credentials.');
  }
  if (!res.ok) throw httpError(502, 'Gmail request failed.');
  return res.json();
}

function decode(data) {
  return Buffer.from(data, 'base64url').toString('utf8');
}

function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectBody(part, acc = { text: '', html: '' }) {
  if (!part) return acc;
  const mime = part.mimeType || '';
  const data = part.body?.data;
  if (data && mime === 'text/plain') acc.text += decode(data);
  else if (data && mime === 'text/html') acc.html += decode(data);
  for (const child of part.parts || []) collectBody(child, acc);
  return acc;
}

function headerMap(headers = []) {
  const map = {};
  for (const h of headers) map[h.name.toLowerCase()] = h.value;
  return map;
}

function parseSender(from = '') {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim() || match[2].trim(), email: match[2].trim() };
  return { name: from.trim(), email: from.trim() };
}

function extractRecipientAliases({ to = '', cc = '', deliveredTo = '' }) {
  const haystack = `${to} ${cc} ${deliveredTo}`.toLowerCase();
  const pattern = new RegExp(`${config.mailbox.local}\\+([a-z0-9._-]{1,31})@${config.mailbox.domain}`, 'g');
  const aliases = new Set();
  for (const match of haystack.matchAll(pattern)) aliases.add(match[1]);
  return [...aliases];
}

function normalizeMessage(message) {
  const payload = message.payload || {};
  const headers = headerMap(payload.headers);
  const { text, html } = collectBody(payload);
  const body = (text || (html ? htmlToText(html) : '') || message.snippet || '').trim();
  const to = headers.to || '';
  const cc = headers.cc || '';
  const deliveredTo = headers['delivered-to'] || '';

  return {
    id: message.id,
    threadId: message.threadId,
    subject: headers.subject || '(no subject)',
    from: parseSender(headers.from || ''),
    to,
    cc,
    deliveredTo,
    date: new Date(Number(message.internalDate) || Date.parse(headers.date) || Date.now()).toISOString(),
    snippet: message.snippet || '',
    body,
    htmlBody: html || '',
    recipientAliases: extractRecipientAliases({ to, cc, deliveredTo }),
    unread: (message.labelIds || []).includes('UNREAD'),
  };
}

/** Defensive check: Gmail search can be fuzzy, so verify the alias really is a recipient. */
function matchesAlias(message, aliasEmail) {
  const needle = aliasEmail.toLowerCase();
  return [message.to, message.cc, message.deliveredTo].join(' ').toLowerCase().includes(needle);
}

function buildSearchTerm(search, searchBy) {
  if (!search) return '';
  if (searchBy === 'subject') return `subject:(${search})`;
  if (searchBy === 'email') return `(from:(${search}) OR to:(${search}) OR cc:(${search}))`;
  if (searchBy === 'alias') {
    const alias = search.trim().toLowerCase();
    if (/^[a-z0-9][a-z0-9._-]{0,30}$/.test(alias)) {
      return `to:(${config.mailbox.local}+${alias}@${config.mailbox.domain})`;
    }
    return `to:(${search})`;
  }
  const aliasRecipient = /^[a-z0-9][a-z0-9._-]{0,30}$/i.test(search)
    ? ` OR to:(${config.mailbox.local}+${search})`
    : '';
  return `(subject:(${search}) OR from:(${search}) OR to:(${search})${aliasRecipient})`;
}

function matchesSearch(message, lowered, searchBy) {
  if (!lowered) return true;
  if (searchBy === 'subject') return message.subject.toLowerCase().includes(lowered);
  if (searchBy === 'email') {
    return [message.from.email, message.from.name, message.to, message.cc, message.deliveredTo]
      .join(' ')
      .toLowerCase()
      .includes(lowered);
  }
  if (searchBy === 'alias') {
    return [message.recipientAliases.join(' '), message.to, message.cc, message.deliveredTo]
      .join(' ')
      .toLowerCase()
      .includes(lowered);
  }
  return [message.subject, message.from.name, message.from.email, message.to, message.cc, message.deliveredTo]
    .join(' ')
    .toLowerCase()
    .includes(lowered);
}

async function fetchMessages(messageRefs, concurrency = 20) {
  const messages = new Array(messageRefs.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < messageRefs.length) {
      const index = nextIndex++;
      messages[index] = normalizeMessage(await gmailGet(`/messages/${messageRefs[index].id}`, { format: 'full' }));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, messageRefs.length) }, () => worker()));
  return messages;
}

export async function listAliasMessagePage({
  aliasEmail,
  limit = 25,
  search = '',
  searchBy = 'all',
  pageToken = '',
  after = '',
  before = '',
}) {
  const terms = [];
  if (aliasEmail) terms.push(`to:${aliasEmail}`);
  const typedSearch = buildSearchTerm(search, searchBy);
  if (typedSearch) terms.push(typedSearch);
  if (after) terms.push(`after:${after}`);
  if (before) terms.push(`before:${before}`);

  const data = await gmailGet('/messages', {
    q: terms.join(' ').trim(),
    maxResults: String(Math.min(Math.max(limit, 1), 500)),
    ...(pageToken ? { pageToken } : {}),
  });

  const messages = await fetchMessages(data.messages || []);

  const lowered = search.toLowerCase();
  return {
    messages: messages
    .filter((m) => {
      if (aliasEmail && !matchesAlias(m, aliasEmail)) return false;
      return matchesSearch(m, lowered, searchBy);
    })
    .sort((a, b) => b.date.localeCompare(a.date)),
    nextPageToken: data.nextPageToken || null,
    resultSizeEstimate: Number(data.resultSizeEstimate) || 0,
  };
}

export async function listAliasMessages(options) {
  const page = await listAliasMessagePage(options);
  return page.messages;
}
