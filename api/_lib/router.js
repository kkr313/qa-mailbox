import { config, aliasAddress, httpError } from './config.js';
import { verifyCredentials, signToken, requireAuth, sessionCookie, clearSessionCookie } from './auth.js';
import { listAliasMessagePage, listAliasMessages, gmailConfigured } from './gmail.js';
import { extractOtp } from './otp.js';

// Best-effort throttle. Serverless instances are short-lived, so this slows down
// a burst against a warm instance rather than guaranteeing a global limit.
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 20;

function throttle(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) throw httpError(429, 'Too many login attempts. Try again later.');
}

// Gmail search operators are stripped so a query can never escape the alias filter.
function sanitizeSearch(value) {
  return String(value || '')
    .replace(/[^\w\s@.\-+]/g, ' ')
    .trim()
    .slice(0, 100);
}

function sanitizeSearchBy(value) {
  const mode = String(value || 'all').trim().toLowerCase();
  return ['all', 'alias', 'email', 'subject'].includes(mode) ? mode : 'all';
}

// Anyone signed in can pick any alias name (credentials are shared QA-team wide),
// so the only safety net is making sure it can't be used to inject Gmail search operators.
function sanitizeAlias(value) {
  const alias = String(value || '').trim().toLowerCase();
  if (alias === config.mailbox.address) return alias;
  if (!/^[a-z0-9][a-z0-9._-]{0,30}$/.test(alias)) {
    throw httpError(400, 'Alias must be alphanumeric (dots, dashes and underscores allowed).');
  }
  return alias;
}

function parseDateBoundary(value, endOfDay = false, timezoneOffset = 0) {
  const input = String(value || '').trim();
  if (!input) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw httpError(400, 'Dates must use YYYY-MM-DD format.');
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
    throw httpError(400, 'Invalid date.');
  }
  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return String(Math.floor((date.getTime() + timezoneOffset * 60_000) / 1000));
}

function parseTimezoneOffset(value) {
  const offset = Number(value || 0);
  if (!Number.isInteger(offset) || offset < -840 || offset > 840) {
    throw httpError(400, 'Invalid timezone offset.');
  }
  return offset;
}

function sanitizePageToken(value) {
  const token = String(value || '').trim();
  if (token && !/^[a-z0-9_-]{1,500}$/i.test(token)) throw httpError(400, 'Invalid page token.');
  return token;
}

/**
 * Platform-agnostic router shared by the Vercel and Netlify function adapters.
 * `req` is { method, path, query, body, headers, ip }.
 */
export async function handleApi(req) {
  const fetchMode = req.headers['sec-fetch-mode'] || req.headers['Sec-Fetch-Mode'] || '';
  const accept = req.headers.accept || req.headers.Accept || '';
  if (req.method === 'GET' && (fetchMode === 'navigate' || accept.includes('text/html'))) {
    return {
      status: 302,
      headers: {
        location: `/not-found?path=${encodeURIComponent(req.path)}`,
        'cache-control': 'no-store',
      },
      body: null,
    };
  }

  const path = req.path.replace(/^\/api/, '').replace(/\/+$/, '') || '/';

  if (path === '/health' && req.method === 'GET') {
    return { status: 200, body: { ok: true, gmail: gmailConfigured(), mailbox: config.mailbox.address } };
  }

  if (path === '/auth/login' && req.method === 'POST') {
    throttle(req.ip || 'unknown');
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || !password) throw httpError(400, 'Username and password are required');

    const user = verifyCredentials(username, password);
    if (!user) throw httpError(401, 'Invalid username or password');

    const token = await signToken(user);
    return {
      status: 200,
      headers: { 'set-cookie': sessionCookie(token) },
      body: { token, user: { username: user.username } },
    };
  }

  if (path === '/auth/logout' && req.method === 'POST') {
    return {
      status: 200,
      headers: { 'set-cookie': clearSessionCookie() },
      body: { ok: true },
    };
  }

  if (path === '/auth/me' && req.method === 'GET') {
    const user = await requireAuth(req.headers);
    return { status: 200, body: { user: { username: user.username } } };
  }

  if (path === '/messages' && req.method === 'GET') {
    await requireAuth(req.headers);
    const global = String(req.query.global || '').toLowerCase() === 'true';
    const aliasEmail = global ? '' : aliasAddress(sanitizeAlias(req.query.alias));
    const searchBy = sanitizeSearchBy(req.query.searchBy);
    const page = await listAliasMessagePage({
      aliasEmail,
      limit: Number(req.query.limit) || (global ? 50 : 25),
      pageToken: sanitizePageToken(req.query.pageToken),
      search: sanitizeSearch(req.query.search),
      searchBy,
    });

    return {
      status: 200,
      body: {
        mailbox: config.mailbox.address,
        aliasEmail: aliasEmail || config.mailbox.address,
        global,
        searchBy,
        nextPageToken: page.nextPageToken,
        resultSizeEstimate: page.resultSizeEstimate,
        messages: page.messages.map((m) => ({ ...m, otp: extractOtp({ subject: m.subject, body: m.body }) })),
      },
    };
  }

  if (path === '/mailbox/all' && req.method === 'GET') {
    await requireAuth(req.headers);
    const requestedLimit = Number(req.query.limit) || 25;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const timezoneOffset = parseTimezoneOffset(req.query.timezoneOffset);
    if (from && to && from > to) throw httpError(400, 'From date cannot be after To date.');
    const page = await listAliasMessagePage({
      aliasEmail: '',
      limit,
      pageToken: sanitizePageToken(req.query.pageToken),
      after: parseDateBoundary(from, false, timezoneOffset),
      before: parseDateBoundary(to, true, timezoneOffset),
    });
    const aliases = new Map();

    for (const message of page.messages) {
      const enrichedMessage = { ...message, otp: extractOtp({ subject: message.subject, body: message.body }) };
      for (const alias of message.recipientAliases) {
        if (!aliases.has(alias)) {
          aliases.set(alias, {
            alias,
            email: aliasAddress(alias),
            messageCount: 0,
            latestMessageAt: message.date,
            messages: [],
          });
        }
        const group = aliases.get(alias);
        group.messageCount += 1;
        group.messages.push(enrichedMessage);
      }
    }

    return {
      status: 200,
      body: {
        mailbox: config.mailbox.address,
        scannedMessages: page.messages.length,
        resultSizeEstimate: page.resultSizeEstimate,
        limit,
        from: from || null,
        to: to || null,
        timezoneOffset,
        nextPageToken: page.nextPageToken,
        aliases: [...aliases.values()].sort((a, b) => b.latestMessageAt.localeCompare(a.latestMessageAt)),
      },
    };
  }

  throw httpError(404, 'Not found');
}

export function errorResponse(err) {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  return { status, body: { error: status === 500 ? 'Something went wrong' : err.message } };
}
