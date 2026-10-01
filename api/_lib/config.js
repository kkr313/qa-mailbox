const mailbox = process.env.MAILBOX_ADDRESS || 'only4qause@gmail.com';
const [local, domain] = mailbox.split('@');

export const config = {
  mailbox: { address: mailbox, local, domain },
  tokenTtl: '12h',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
  },
};

export function aliasAddress(alias) {
  // A username that is already a full email (e.g. the shared mailbox itself)
  // sees the whole inbox instead of a +alias slice.
  if (alias.includes('@')) return alias;
  return `${config.mailbox.local}+${alias}@${config.mailbox.domain}`;
}

export function jwtSecret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw httpError(500, 'Server is misconfigured: JWT_SECRET must be set to at least 32 characters.');
  }
  return new TextEncoder().encode(value);
}

export function httpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}
