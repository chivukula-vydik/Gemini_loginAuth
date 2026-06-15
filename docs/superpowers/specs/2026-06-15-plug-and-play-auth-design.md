# Plug-and-Play Auth Service — Design

**Date:** 2026-06-15
**Status:** Approved (pending spec review)

## Summary

A reusable, config-driven authentication service. Providers (email/password,
Google OAuth, SAML) are plug-in modules registered from a config file at boot.
Enabling or disabling a provider requires **no code changes** — only a flag in
`auth.config.json`. A React `<LoginWidget />` discovers enabled providers at
runtime and renders only their buttons.

## Goals

- Plug-and-play providers: add/remove an auth method via config alone.
- Three providers in v1: `local` (email/password), `google` (OAuth 2.0), `saml`.
- Reusable as a standalone service consumable by other apps.
- Local SAML development without an external IdP (Okta/Azure).

## Non-Goals (v1)

- No automated test suite (explicit decision).
- No runtime admin UI for editing config (config is file + env, read at boot).
- No MFA, password reset emails, or rate-limiting hardening beyond basics
  (can be layered later; not in v1 scope).

## Decisions

| Topic              | Decision                                                |
|--------------------|---------------------------------------------------------|
| HTTP framework     | Express                                                 |
| Strategy layer     | Passport.js                                             |
| Config source      | `auth.config.json` (structure/toggles) + env (secrets)  |
| Sessions           | Stateless JWT: access + refresh                         |
| Refresh transport  | httpOnly + Secure cookie; rotated; stored/revocable     |
| Account linking    | Same email → same user, multiple linked providers       |
| Database           | MongoDB via Mongoose                                     |
| Frontend           | React 19 + Vite + TypeScript                            |
| Deploy             | docker-compose: auth-api, web, mongo, test-saml-idp     |

## Architecture — Provider Registry Pattern

At boot, `configLoader` reads and validates `auth.config.json` and injects
secrets from env. `providerRegistry` iterates providers where `enabled: true`
and, for each, calls the provider module to register its Passport strategy and
mount its routes. Disabled providers are never loaded.

```
auth.config.json ──► configLoader ──► providerRegistry
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                        ▼                        ▼
            providers/local.js      providers/google.js      providers/saml.js
            (strategy + routes)     (strategy + routes)      (strategy + routes)
```

### Provider module interface

Every provider exports a uniform shape so the registry treats them identically:

```js
export default {
  id: 'google',                       // stable id, also surfaced to the widget
  displayName: 'Google',              // label for the widget button
  kind: 'oauth-redirect' | 'password' | 'saml-redirect',
  register(passport, router, providerConfig, deps) {
    // 1. passport.use(new Strategy(...))
    // 2. router.get/post(...) for this provider's endpoints
  },
}
```

`deps` carries shared services (token service, user service) so providers stay
decoupled from concrete implementations. Adding a 4th provider = drop one file
under `providers/` + add a config block. No core changes.

## Components

### Backend (`auth-api`)

- `config/configLoader.js` — load + validate `auth.config.json`, merge env
  secrets, expose enabled-provider list and per-provider config.
- `providers/local.js` — passport-local; bcrypt password hashing; register +
  login routes.
- `providers/google.js` — passport-google-oauth20; redirect + callback routes.
- `providers/saml.js` — @node-saml/passport-saml; redirect + assertion callback.
- `providers/index.js` — the registry; mounts enabled providers onto the router.
- `routes/auth.js` — shared endpoints (see API below).
- `services/tokens.js` — issue access + refresh JWTs; persist, rotate, revoke
  refresh tokens.
- `services/users.js` — find-or-create / link-provider logic.
- `models/User.js`, `models/RefreshToken.js` — Mongoose schemas.
- `middleware/requireAuth.js` — verify access JWT, attach `req.user`.
- `app.js` / `server.js` — wiring and boot.

### Frontend (`web`)

- `<LoginWidget />` — fetches `GET /auth/providers`; renders an email/password
  form for `password` providers and redirect buttons for `*-redirect`
  providers. Renders only what is enabled.
- `authContext` — holds the in-memory access token, exposes `login`, `logout`,
  `user`; calls `/auth/refresh` on load / on 401.

## API surface

Shared (always mounted):

- `GET  /auth/providers` — `[{ id, displayName, kind, startUrl? }]`. Discovery
  endpoint the widget reads.
- `POST /auth/refresh` — reads refresh cookie, validates against Mongo, rotates,
  returns a fresh access token.
- `POST /auth/logout` — revokes the refresh token, clears the cookie.
- `GET  /auth/me` — returns the current user (requires access token).

Per provider (mounted only when enabled):

- **local:** `POST /auth/local/register`, `POST /auth/local/login`.
- **google:** `GET /auth/google` → Google; `GET /auth/google/callback`.
- **saml:** `GET /auth/saml` → IdP; `POST /auth/saml/callback` (assertion).

## Token / session flow

- **Access token:** short-lived JWT (e.g. 15 min), returned in the JSON
  response body; held in memory by the SPA.
- **Refresh token:** long-lived JWT (e.g. 7 days), set as an httpOnly + Secure
  cookie. The token's hash is stored in Mongo so it can be revoked. `/auth/refresh`
  validates the cookie against Mongo and rotates the token on each use.
- **Logout:** revoke the stored refresh token and clear the cookie.

OAuth/SAML callbacks complete by issuing tokens, setting the refresh cookie, and
redirecting back to the web app, which then calls `/auth/me`.

## Data model

**User**

```
{
  email: string,          // unique, lowercased — the linking key
  displayName: string,
  passwordHash?: string,  // present only if local provider used
  providers: [{ provider: string, providerUserId: string }],
  createdAt: Date
}
```

**RefreshToken**

```
{
  userId: ObjectId,
  tokenHash: string,      // hash of the issued refresh token
  expiresAt: Date,
  revokedAt?: Date,
  createdAt: Date
}
```

### Account linking

On any successful provider login, look up the user by lowercased email.
If found, ensure the provider is present in `user.providers` (add if missing)
and proceed as that user. If not found, create the user. One email = one user,
many linked providers.

## Error handling

- Config validation fails at boot → log a clear error and refuse to start
  (fail fast rather than mounting a half-configured provider).
- Missing secret for an enabled provider → boot error naming the missing env var.
- Invalid/expired access token → 401; the SPA attempts `/auth/refresh` once.
- Invalid/expired/revoked refresh token → 401; clear cookie; force re-login.
- Provider callback failure (denied consent, bad SAML assertion) → redirect to
  web with an error query param the widget can show.

## Deployment — docker-compose

Four services on a shared network:

- `auth-api` — the Express service.
- `web` — the Vite-built React app.
- `mongo` — database.
- `test-saml-idp` — `kristophjunge/test-saml-idp` for local SAML development.

Callback URLs in `auth.config.json` reference compose service names so SAML/OAuth
flows work inside the network without an external tenant.

## Example `auth.config.json`

```json
{
  "providers": {
    "local": { "enabled": true },
    "google": {
      "enabled": true,
      "clientID": "env:GOOGLE_CLIENT_ID",
      "clientSecret": "env:GOOGLE_CLIENT_SECRET",
      "callbackURL": "http://localhost:4000/auth/google/callback"
    },
    "saml": {
      "enabled": true,
      "entryPoint": "http://test-saml-idp:8080/simplesaml/saml2/idp/SSOService.php",
      "issuer": "auth-service",
      "callbackURL": "http://localhost:4000/auth/saml/callback",
      "cert": "env:SAML_IDP_CERT"
    }
  }
}
```

`env:NAME` markers are resolved by `configLoader` from environment variables so
secrets never live in the committed file.
