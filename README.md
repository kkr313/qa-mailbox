# QA Mailbox

A shared QA inbox for Gmail plus-address aliases. Team members sign in with one shared application login, create environment-specific addresses such as `only4qause+dev_otter_mango_42@gmail.com`, and view only the messages sent to the selected alias.

## Features

- Shared username/password login with signed sessions
- Manual and memorable random alias generation
- Development, Stage, Non-production, and Production alias prefixes
- Alias-scoped and mailbox-wide search
- Original HTML email rendering in a sandboxed frame
- OTP detection and one-click copy
- Opened/unopened message indicators
- Automatic mailbox refresh every 10 seconds while the tab is visible
- Netlify and Vercel serverless adapters

## Architecture

- React + Vite frontend in `client/`
- Platform-neutral API logic in `api/_lib/`
- Vercel function in `api/[...route].js`
- Netlify function in `netlify/functions/api.mjs`
- Gmail REST API using a read-only OAuth refresh token

Generated aliases and opened-message state are stored in browser `localStorage`. They are not synchronized across browsers. Email content is always read from the shared Gmail mailbox.

## Requirements

- Node.js 20 or newer
- A Gmail mailbox with plus-address support
- A Google Cloud project with the Gmail API enabled

## Local Setup

1. Install dependencies:

   ```bash
   npm run install:all
   ```

2. Create the local environment file:

   ```bash
   cp .env.example .env
   ```

3. Generate a session secret:

   ```bash
   openssl rand -hex 32
   ```

4. Add the value to `JWT_SECRET` and configure the remaining variables described below.

5. Start the app:

   ```bash
   npm run dev
   ```

The frontend runs at `http://localhost:2113` and the local API runs at `http://localhost:4213`.

## Gmail OAuth Setup

1. Enable the Gmail API in Google Cloud Console.
2. Configure the OAuth consent screen and add the shared mailbox as a test user if the app is in testing mode.
3. Create an OAuth client and add this authorized redirect URI:

   ```text
   http://localhost:4213/oauth2callback
   ```

4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`.
5. Run the one-time authorization flow:

   ```bash
   npm run gmail:auth
   ```

6. Sign in as the shared Gmail mailbox and approve read-only access.
7. Store the printed value in `GOOGLE_REFRESH_TOKEN`.

The refresh token is reused automatically. The OAuth flow is not required on every start.

## Environment Variables

| Variable | Description |
| --- | --- |
| `JWT_SECRET` | Random secret of at least 32 characters used to sign sessions |
| `QA_USERS` | Comma-separated `username:password` login entries |
| `MAILBOX_ADDRESS` | Shared Gmail address, for example `only4qause@gmail.com` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | One-time Gmail OAuth refresh token |
| `GOOGLE_REDIRECT_URI` | Local OAuth callback URL |
| `DEV_API_PORT` | Local API port, normally `4213` |

Example login format:

```text
QA_USERS=qa@example.com:replace-with-a-strong-password
```

Do not commit `.env` or paste real credentials into issues, commits, or documentation.

## Production Build

```bash
npm run build
```

The frontend output is written to `client/dist/`.

## Deploy to Netlify

1. Push this repository to GitHub.
2. Import the repository in Netlify.
3. Netlify reads `netlify.toml`; no build settings need to be entered manually.
4. Add all production environment variables in **Site configuration > Environment variables**.
5. Deploy the site.

Do not use manual drag-and-drop deployment of `client/dist`; the app also requires the serverless Gmail API function.

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repository in Vercel.
3. Vercel reads `vercel.json` and deploys `api/[...route].js` as a serverless function.
4. Add all production environment variables in **Project Settings > Environment Variables**.
5. Deploy the project.

## Security Notes

- Gmail access uses the read-only scope.
- Secrets remain server-side and must only be stored in `.env` or hosting-provider environment settings.
- `QA_USERS` is intentionally simple for an internal QA tool. Use a managed identity provider for public or high-security deployments.
- Login rate limiting is best-effort per serverless instance. Use shared storage such as Redis for strict distributed rate limits.
- Rotate any credential that has been exposed outside secret storage.

## Project Structure

```text
api/                  Shared API and Vercel adapter
client/               React/Vite frontend
netlify/functions/    Netlify adapter
scripts/              Local API and one-time Gmail OAuth helpers
netlify.toml           Netlify deployment configuration
vercel.json            Vercel deployment configuration
```