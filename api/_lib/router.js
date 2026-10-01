import { config, aliasAddress, httpError } from './config.js';
import { verifyCredentials, signToken, requireAuth } from './auth.js';
import { listAliasMessages, gmailConfigured } from './gmail.js';
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

/**
 * Platform-agnostic router shared by the Vercel and Netlify function adapters.
 * `req` is { method, path, query, body, headers, ip }.
 */
export async function handleApi(req) {
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

    return {
      status: 200,
      body: { token: await signToken(user), user: { username: user.username } },
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
    const messages = await listAliasMessages({
      aliasEmail,
      limit: Number(req.query.limit) || (global ? 50 : 25),
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
        messages: messages.map((m) => ({ ...m, otp: extractOtp({ subject: m.subject, body: m.body }) })),
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
