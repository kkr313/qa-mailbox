#!/usr/bin/env node
/**
 * One-time local helper: exchanges a Google OAuth consent for a long-lived
 * refresh token. Run it signed in as the shared QA mailbox account, then store
 * the printed token as GOOGLE_REFRESH_TOKEN in your hosting provider.
 */
import http from 'node:http';
import 'dotenv/config';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4213/oauth2callback';

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.');
  process.exit(1);
}

const redirect = new URL(redirectUri);

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  access_type: 'offline',
  prompt: 'consent',
  scope: 'https://www.googleapis.com/auth/gmail.readonly',
}).toString();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== redirect.pathname) {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('Missing authorization code.');
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.refresh_token) throw new Error(tokens.error_description || 'No refresh token returned.');

    res.writeHead(200, { 'content-type': 'text/plain' }).end('Done. You can close this tab.');
    console.log('\nStore this as an environment variable:\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  } catch (err) {
    res.writeHead(500).end('Token exchange failed.');
    console.error(err.message);
  } finally {
    server.close();
  }
});

server.listen(Number(redirect.port) || 80, () => {
  console.log('Sign in as the shared QA mailbox and approve access:\n');
  console.log(authUrl.toString(), '\n');
});
