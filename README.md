# Plug-and-Play Auth Service

A reusable, config-driven authentication service. Auth providers — email/password,
Google OAuth, and SAML — are plug-in modules toggled from `auth.config.json`.
Enabling or disabling a provider needs **no code changes**. A React `<LoginWidget />`
discovers the enabled providers at runtime and renders only their buttons.

## Stack

- **auth-api** — Node 22 + Express + Passport.js, MongoDB (Mongoose), JWT sessions.
- **web** — React 19 + Vite + TypeScript.
- **mongo** — database.
- **test-saml-idp** — `kristophjunge/test-saml-idp` for local SAML development (no Okta/Azure tenant needed).

Sessions are stateless JWTs: a short-lived **access token** returned in the JSON body
(held in memory by the SPA) and a long-lived **refresh token** in an httpOnly, rotating,
revocable cookie.

## Prerequisites

- Docker + Docker Compose, **or** Node 22 + a local MongoDB for running services directly.

## Quick start (Docker)

```bash
cp .env.example .env      # then fill in the values you need (see below)
docker compose up --build
```

- Web app: http://localhost:5173
- Auth API: http://localhost:4000 (try `curl http://localhost:4000/auth/providers`)
- Test SAML IdP: http://localhost:8080

## Configuration

### `auth.config.json` — which providers exist and their non-secret settings

Toggle a provider with its `enabled` flag. Secret/structured values use `env:NAME`
markers that the config loader resolves from environment variables at boot, so no
secrets live in the committed file.

```json
{
  "providers": {
    "local":  { "enabled": true,  "displayName": "Email & Password" },
    "google": { "enabled": false, "displayName": "Google", "clientID": "env:GOOGLE_CLIENT_ID", ... },
    "saml":   { "enabled": false, "displayName": "SAML SSO", "cert": "env:SAML_IDP_CERT", ... }
  }
}
```

**Defaults:** `local` is enabled so the stack works out of the box. `google` and `saml`
ship **disabled** because they need external setup (Google credentials / an IdP cert) —
flip `enabled` to `true` after providing their env vars (see Provider setup below).

If an enabled provider is missing a required field, the server **fails fast at boot**
with an error naming the missing key/env var — so enable a provider only once its env
vars are filled in.

### `.env` — secrets and runtime settings

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
|---|---|
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Sign access/refresh JWTs. Change for any real use. |
| `ACCESS_TTL`, `REFRESH_TTL` | Token lifetimes (default `15m` / `7d`). |
| `WEB_URL` | SPA origin, used for CORS and OAuth/SAML redirects. |
| `COOKIE_SECURE` | Set `true` behind HTTPS. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth credentials. |
| `SAML_IDP_CERT` | IdP signing certificate (PEM or base64). |
| `SMTP_*`, `MAIL_FROM` | Password-reset email. Leave `SMTP_HOST` empty in dev to log reset links to the console instead of sending. |

### Feature flags

Feature flags are split by runtime:

- Backend flags are loaded from `auth.config.json` under `features`, with optional env overrides.
- Frontend flags are read from Vite env vars (`VITE_FF_*`) at build/start time.

Current flags:

| Flag | Runtime | Default | Effect |
|---|---|---|---|
| `pmTaskBulk` | backend | `true` | Enables `PATCH /projects/:id/tasks/bulk` |
| `FEATURE_PM_TASK_BULK` | backend env override | unset | Overrides `pmTaskBulk` when present |
| `VITE_FF_PM_TASK_TOOLS` | frontend | `true` | Enables project task toolbar filters + pagination |
| `VITE_FF_PM_TASK_BULK` | frontend | `true` | Enables checkbox selection + bulk bar actions |

Examples:

- Disable backend bulk endpoint: set `"features": { "pmTaskBulk": false }` in `auth.config.json` (or `FEATURE_PM_TASK_BULK=false`).
- Disable frontend bulk UI: start web with `VITE_FF_PM_TASK_BULK=false`.

## Provider setup

### Google OAuth
1. In Google Cloud Console, create an OAuth 2.0 Client ID (Web application).
2. Add authorized redirect URI: `http://localhost:4000/auth/google/callback`.
3. Put the client ID/secret in `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### SAML (local test IdP)
1. Start the IdP: `docker compose up -d test-saml-idp`.
2. Extract its signing certificate and put it in `.env` as `SAML_IDP_CERT`:
   ```bash
   docker compose exec test-saml-idp cat /var/www/simplesamlphp/cert/server.crt
   ```
   (The provider accepts a raw PEM block or a base64-encoded one.)
3. Demo logins shipped by the image: **`user1` / `user1pass`** (and `user2` / `user2pass`).

> Note: this project pins `@node-saml/passport-saml@4`, whose strategy option for the
> IdP certificate is `cert` (not the `idpCert` used by 5.x). It's already wired correctly.

### Password reset
`POST /auth/local/forgot-password` always returns `200` (no account enumeration). When
SMTP isn't configured, the reset link is printed to the auth-api console:
`[mailer:dev] password reset for <email>: <url>`. Open that URL (`/reset?token=...`)
to set a new password; doing so revokes existing refresh tokens.

## API summary

Shared: `GET /auth/providers`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
Local: `POST /auth/local/register|login|forgot-password|reset-password`.
Google: `GET /auth/google` → `GET /auth/google/callback`.
SAML: `GET /auth/saml` → `POST /auth/saml/callback`.

## Proving plug-and-play

1. Out of the box only `local` is enabled, so `http://localhost:5173` shows just the
   email/password form and `/auth/providers` lists only `local`.
2. Provide the SAML cert (see SAML setup), set `"saml": { "enabled": true }` in
   `auth.config.json`, and restart `auth-api` (`docker compose restart auth-api`).
3. Reload the web app: a "Continue with SAML SSO" button now appears, `/auth/providers`
   lists `saml`, and `/auth/saml` redirects to the IdP — the provider was mounted with
   no code changed. Flip it back to `false` and it disappears entirely (`/auth/saml` → 404).

## Running without Docker

```bash
# Mongo must be running locally at mongodb://localhost:27017
cd auth-api && npm install && MONGO_URL=mongodb://localhost:27017/auth npm start
cd web && npm install && npm run dev
```
