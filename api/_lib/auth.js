import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config, jwtSecret, httpError } from './config.js';

let cachedUsers = null;
const SESSION_COOKIE = 'qa_mailbox_session';

/**
 * Login users come from the QA_USERS env var as "username:password" pairs, shared
 * across the whole QA team. Mailbox aliases are chosen inside the app after login,
 * independent of who's signed in - see AliasManager.jsx.
 *   QA_USERS=qa:Sup3rSecret,admin:An0therPass
 */
export function getUsers() {
  if (cachedUsers) return cachedUsers;

  const raw = (process.env.QA_USERS || '').trim();
  if (!raw) throw httpError(500, 'Server is misconfigured: QA_USERS is not set.');

  cachedUsers = raw
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(':');
      const username = entry.slice(0, separator).trim().toLowerCase();
      const password = entry.slice(separator + 1).trim();
      if (separator < 1 || !password) {
        throw httpError(500, 'Server is misconfigured: QA_USERS entries must be username:password.');
      }
      return { username, password };
    });

  return cachedUsers;
}

function sameSecret(a, b) {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function verifyCredentials(username, password) {
  const user = getUsers().find((u) => u.username === username);
  // Always compare so a missing user and a wrong password cost the same.
  const expected = user?.password || crypto.randomUUID();
  return sameSecret(password, expected) && user ? user : null;
}

export async function signToken(user) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.username)
    .setIssuedAt()
    .setExpirationTime(config.tokenTtl)
    .sign(jwtSecret());
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=43200`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0`;
}

function cookieToken(headers) {
  const cookie = headers.cookie || headers.Cookie || '';
  const entry = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return entry ? entry.slice(SESSION_COOKIE.length + 1) : null;
}

export async function requireAuth(headers) {
  const header = headers.authorization || headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : cookieToken(headers);
  if (!token) throw httpError(401, 'Not authenticated');

  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwtSecret()));
  } catch {
    throw httpError(401, 'Session expired');
  }

  const user = getUsers().find((u) => u.username === payload.sub);
  if (!user) throw httpError(401, 'Not authenticated');
  return user;
}
