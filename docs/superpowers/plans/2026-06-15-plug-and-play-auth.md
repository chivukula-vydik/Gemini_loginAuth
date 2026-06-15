# Plug-and-Play Auth Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, config-driven authentication service where email/password, Google OAuth, and SAML providers are plug-in modules toggled via `auth.config.json`, fronted by a React widget that renders only enabled providers.

**Architecture:** An Express `auth-api` reads `auth.config.json` at boot and, via a provider registry, mounts a Passport strategy + routes for each enabled provider. Sessions are stateless JWTs: a short-lived access token in the JSON body and a rotating, revocable refresh token in an httpOnly cookie. A React 19 + Vite + TS `web` app discovers providers from `GET /auth/providers`. Everything runs under docker-compose (auth-api, web, mongo, test-saml-idp).

**Tech Stack:** Node 22, Express, Passport.js (passport-local, passport-google-oauth20, @node-saml/passport-saml), Mongoose/MongoDB, jsonwebtoken, bcrypt, nodemailer, React 19, Vite, TypeScript, Docker Compose.

> **Note on testing:** Per project decision there is **no automated test suite**. Each task is verified manually (boot the server, `curl` the endpoint, or use the browser). Verification steps state the exact command and expected result.

---

## File Structure

```
login/
├─ docker-compose.yml
├─ auth.config.json
├─ .env.example
├─ auth-api/
│  ├─ Dockerfile
│  ├─ package.json
│  ├─ src/
│  │  ├─ server.js              # boot: connect mongo, start http
│  │  ├─ app.js                 # express app, middleware, route mounting
│  │  ├─ config/configLoader.js # load+validate auth.config.json, resolve env:
│  │  ├─ db/connect.js          # mongoose connection
│  │  ├─ models/User.js
│  │  ├─ models/RefreshToken.js
│  │  ├─ models/PasswordResetToken.js
│  │  ├─ services/tokens.js     # issue/rotate/revoke JWTs
│  │  ├─ services/users.js      # find-or-create / link provider
│  │  ├─ services/mailer.js     # nodemailer + dev console fallback
│  │  ├─ middleware/requireAuth.js
│  │  ├─ providers/index.js     # registry: mount enabled providers
│  │  ├─ providers/local.js
│  │  ├─ providers/google.js
│  │  ├─ providers/saml.js
│  │  └─ routes/auth.js         # shared: providers, refresh, logout, me
└─ web/
   ├─ Dockerfile
   ├─ package.json
   ├─ vite.config.ts
   ├─ index.html
   └─ src/
      ├─ main.tsx
      ├─ App.tsx
      ├─ api.ts                 # fetch helpers, token handling
      ├─ authContext.tsx
      ├─ LoginWidget.tsx
      ├─ ForgotPassword.tsx
      └─ ResetPassword.tsx
```

---

## Task 1: Repo scaffold + docker-compose + Mongo

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `auth.config.json`

- [ ] **Step 1: Create `.env.example`**

```bash
# auth-api
PORT=4000
MONGO_URL=mongodb://mongo:27017/auth
JWT_ACCESS_SECRET=dev-access-secret-change-me
JWT_REFRESH_SECRET=dev-refresh-secret-change-me
ACCESS_TTL=15m
REFRESH_TTL=7d
WEB_URL=http://localhost:5173
COOKIE_SECURE=false

# google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# saml (PEM cert of the test IdP, single line with \n or base64 — see Task 11)
SAML_IDP_CERT=

# smtp (leave SMTP_HOST empty to log reset links to console in dev)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Auth Service <no-reply@example.com>"
```

- [ ] **Step 2: Create `auth.config.json`**

```json
{
  "providers": {
    "local": { "enabled": true, "displayName": "Email & Password" },
    "google": {
      "enabled": true,
      "displayName": "Google",
      "clientID": "env:GOOGLE_CLIENT_ID",
      "clientSecret": "env:GOOGLE_CLIENT_SECRET",
      "callbackURL": "http://localhost:4000/auth/google/callback"
    },
    "saml": {
      "enabled": true,
      "displayName": "SAML SSO",
      "entryPoint": "http://localhost:8080/simplesaml/saml2/idp/SSOService.php",
      "issuer": "auth-service",
      "callbackURL": "http://localhost:4000/auth/saml/callback",
      "cert": "env:SAML_IDP_CERT"
    }
  }
}
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  mongo:
    image: mongo:7
    ports: ["27017:27017"]
    volumes: ["mongo-data:/data/db"]

  auth-api:
    build: ./auth-api
    env_file: [.env]
    environment:
      - MONGO_URL=mongodb://mongo:27017/auth
    ports: ["4000:4000"]
    volumes:
      - ./auth.config.json:/app/auth.config.json:ro
    depends_on: [mongo]

  web:
    build: ./web
    ports: ["5173:5173"]
    depends_on: [auth-api]

  test-saml-idp:
    image: kristophjunge/test-saml-idp
    ports: ["8080:8080", "8443:8443"]
    environment:
      - SIMPLESAMLPHP_SP_ENTITY_ID=auth-service
      - SIMPLESAMLPHP_SP_ASSERTION_CONSUMER_SERVICE=http://localhost:4000/auth/saml/callback

volumes:
  mongo-data:
```

- [ ] **Step 4: Verify**

Run: `cp .env.example .env && docker compose up -d mongo && docker compose ps`
Expected: `mongo` service shows state `running`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example auth.config.json
git commit -m "chore: scaffold compose, env example, and auth config"
```

---

## Task 2: auth-api base (package.json, Dockerfile, app/server)

**Files:**
- Create: `auth-api/package.json`
- Create: `auth-api/Dockerfile`
- Create: `auth-api/src/db/connect.js`
- Create: `auth-api/src/app.js`
- Create: `auth-api/src/server.js`

- [ ] **Step 1: Create `auth-api/package.json`**

```json
{
  "name": "auth-api",
  "version": "1.0.0",
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js"
  },
  "dependencies": {
    "@node-saml/passport-saml": "^4.0.4",
    "bcrypt": "^5.1.1",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.4.0",
    "nodemailer": "^6.9.13",
    "passport": "^0.7.0",
    "passport-google-oauth20": "^2.0.0",
    "passport-local": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create `auth-api/Dockerfile`**

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 4000
CMD ["node", "src/server.js"]
```

- [ ] **Step 3: Create `auth-api/src/db/connect.js`**

```js
import mongoose from 'mongoose';

export async function connectDb(url) {
  await mongoose.connect(url);
  console.log('[db] connected');
}
```

- [ ] **Step 4: Create `auth-api/src/app.js`**

```js
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.WEB_URL, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (req, res) => res.json({ ok: true }));

  return app;
}
```

- [ ] **Step 5: Create `auth-api/src/server.js`**

```js
import { createApp } from './app.js';
import { connectDb } from './db/connect.js';

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDb(process.env.MONGO_URL);
  const app = createApp();
  app.listen(PORT, () => console.log(`[auth-api] listening on ${PORT}`));
}

main().catch((err) => {
  console.error('[auth-api] fatal', err);
  process.exit(1);
});
```

- [ ] **Step 6: Verify**

Run (from `auth-api/`): `npm install && MONGO_URL=mongodb://localhost:27017/auth PORT=4000 node src/server.js`
Then in another shell: `curl -s localhost:4000/health`
Expected: `{"ok":true}` and console shows `[db] connected`.

- [ ] **Step 7: Commit**

```bash
git add auth-api/package.json auth-api/Dockerfile auth-api/src/db auth-api/src/app.js auth-api/src/server.js
git commit -m "feat: auth-api express base with mongo connection and health check"
```

---

## Task 3: Config loader

**Files:**
- Create: `auth-api/src/config/configLoader.js`

- [ ] **Step 1: Create `auth-api/src/config/configLoader.js`**

```js
import { readFileSync } from 'node:fs';

const VALID_IDS = ['local', 'google', 'saml'];

// Replace any "env:NAME" string value with process.env.NAME.
function resolveEnv(value) {
  if (typeof value === 'string' && value.startsWith('env:')) {
    return process.env[value.slice(4)] || '';
  }
  return value;
}

function resolveBlock(block) {
  const out = {};
  for (const [k, v] of Object.entries(block)) out[k] = resolveEnv(v);
  return out;
}

export function loadConfig(path = process.env.AUTH_CONFIG_PATH || 'auth.config.json') {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw.providers || typeof raw.providers !== 'object') {
    throw new Error('[config] missing "providers" object');
  }

  const enabled = [];
  for (const [id, block] of Object.entries(raw.providers)) {
    if (!VALID_IDS.includes(id)) throw new Error(`[config] unknown provider "${id}"`);
    if (!block.enabled) continue;
    const resolved = resolveBlock(block);
    validateProvider(id, resolved);
    enabled.push({ id, ...resolved });
  }
  if (enabled.length === 0) throw new Error('[config] no providers enabled');
  return { enabled };
}

function validateProvider(id, c) {
  const need = (keys) => keys.forEach((k) => {
    if (!c[k]) throw new Error(`[config] provider "${id}" missing required "${k}" (check env vars)`);
  });
  if (id === 'google') need(['clientID', 'clientSecret', 'callbackURL']);
  if (id === 'saml') need(['entryPoint', 'issuer', 'callbackURL', 'cert']);
}
```

- [ ] **Step 2: Verify**

Run (from `auth-api/`): `node -e "import('./src/config/configLoader.js').then(m => console.log(m.loadConfig('../auth.config.json').enabled.map(p=>p.id)))"`
Expected: with empty Google/SAML env vars this throws a clear `missing required` error naming the env var. Set dummy values (`GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x SAML_IDP_CERT=x`) and it prints `[ 'local', 'google', 'saml' ]`.

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/config/configLoader.js
git commit -m "feat: config loader with env resolution and per-provider validation"
```

---

## Task 4: Mongoose models

**Files:**
- Create: `auth-api/src/models/User.js`
- Create: `auth-api/src/models/RefreshToken.js`
- Create: `auth-api/src/models/PasswordResetToken.js`

- [ ] **Step 1: Create `auth-api/src/models/User.js`**

```js
import mongoose from 'mongoose';

const linkSchema = new mongoose.Schema(
  { provider: String, providerUserId: String },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  displayName: { type: String, default: '' },
  passwordHash: { type: String, default: null },
  providers: { type: [linkSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model('User', userSchema);
```

- [ ] **Step 2: Create `auth-api/src/models/RefreshToken.js`**

```js
import mongoose from 'mongoose';

const refreshSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const RefreshToken = mongoose.model('RefreshToken', refreshSchema);
```

- [ ] **Step 3: Create `auth-api/src/models/PasswordResetToken.js`**

```js
import mongoose from 'mongoose';

const resetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const PasswordResetToken = mongoose.model('PasswordResetToken', resetSchema);
```

- [ ] **Step 4: Verify**

Run (from `auth-api/`): `node -e "import('./src/models/User.js').then(m=>console.log(typeof m.User))"`
Expected: `function`.

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/models
git commit -m "feat: user, refresh token, and password reset token models"
```

---

## Task 5: Token service

**Files:**
- Create: `auth-api/src/services/tokens.js`

- [ ] **Step 1: Create `auth-api/src/services/tokens.js`**

```js
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { RefreshToken } from '../models/RefreshToken.js';

const ACCESS_TTL = process.env.ACCESS_TTL || '15m';
const REFRESH_TTL = process.env.REFRESH_TTL || '7d';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), email: user.email, name: user.displayName },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

// Issue a refresh JWT and persist its hash so it can be rotated/revoked.
export async function issueRefreshToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: String(user._id), jti }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TTL,
  });
  const decoded = jwt.decode(token);
  await RefreshToken.create({
    userId: user._id,
    tokenHash: sha256(token),
    expiresAt: new Date(decoded.exp * 1000),
  });
  return token;
}

// Validate a refresh token against the DB; returns the stored record or null.
export async function findValidRefreshToken(token) {
  try {
    jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    return null;
  }
  const record = await RefreshToken.findOne({ tokenHash: sha256(token) });
  if (!record || record.revokedAt || record.expiresAt < new Date()) return null;
  return record;
}

export async function revokeRefreshToken(token) {
  await RefreshToken.updateOne({ tokenHash: sha256(token) }, { revokedAt: new Date() });
}

export async function revokeAllForUser(userId) {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
}
```

- [ ] **Step 2: Verify**

Run (from `auth-api/`): `JWT_ACCESS_SECRET=a node -e "import('./src/services/tokens.js').then(m=>{const t=m.signAccessToken({_id:'1',email:'e',displayName:'n'});console.log(m.verifyAccessToken(t).email)})"`
Expected: `e`.

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/services/tokens.js
git commit -m "feat: jwt token service with refresh persistence, rotation, revocation"
```

---

## Task 6: User service (find-or-create / link)

**Files:**
- Create: `auth-api/src/services/users.js`

- [ ] **Step 1: Create `auth-api/src/services/users.js`**

```js
import { User } from '../models/User.js';

// Find a user by email and ensure the given provider link exists.
// Used by Google/SAML callbacks. Email is the linking key.
export async function findOrCreateByProvider({ email, displayName, provider, providerUserId }) {
  const normalized = String(email).toLowerCase().trim();
  let user = await User.findOne({ email: normalized });
  if (!user) {
    user = await User.create({
      email: normalized,
      displayName: displayName || normalized,
      providers: [{ provider, providerUserId }],
    });
    return user;
  }
  const linked = user.providers.some(
    (p) => p.provider === provider && p.providerUserId === providerUserId
  );
  if (!linked) {
    user.providers.push({ provider, providerUserId });
    await user.save();
  }
  return user;
}
```

- [ ] **Step 2: Verify**

Run (with mongo up, from `auth-api/`):
`MONGO_URL=mongodb://localhost:27017/auth node -e "import('./src/db/connect.js').then(async d=>{await d.connectDb(process.env.MONGO_URL);const u=await import('./src/services/users.js');const r=await u.findOrCreateByProvider({email:'A@x.com',displayName:'A',provider:'google',providerUserId:'g1'});console.log(r.email,r.providers.length);process.exit(0)})"`
Expected: `a@x.com 1` (email lowercased).

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/services/users.js
git commit -m "feat: user service with email-based account linking"
```

---

## Task 7: requireAuth middleware

**Files:**
- Create: `auth-api/src/middleware/requireAuth.js`

- [ ] **Step 1: Create `auth-api/src/middleware/requireAuth.js`**

```js
import { verifyAccessToken } from '../services/tokens.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}
```

- [ ] **Step 2: Verify**

Covered end-to-end in Task 9 (`/auth/me`). No standalone run.

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/middleware/requireAuth.js
git commit -m "feat: requireAuth middleware verifying access jwt"
```

---

## Task 8: Cookie helper + shared routes (providers, refresh, logout, me)

**Files:**
- Create: `auth-api/src/routes/auth.js`
- Modify: `auth-api/src/app.js`

- [ ] **Step 1: Create `auth-api/src/routes/auth.js`**

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  findValidRefreshToken,
  issueRefreshToken,
  revokeRefreshToken,
  signAccessToken,
} from '../services/tokens.js';
import { User } from '../models/User.js';

const COOKIE_NAME = 'refresh_token';

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/auth',
  };
}

// Shared helper used by every provider after a successful login.
export async function completeLogin(res, user) {
  const refresh = await issueRefreshToken(user);
  res.cookie(COOKIE_NAME, refresh, cookieOptions());
  return signAccessToken(user);
}

export function createAuthRouter(enabledProviders) {
  const router = express.Router();

  router.get('/providers', (req, res) => {
    res.json(
      enabledProviders.map((p) => ({
        id: p.id,
        displayName: p.displayName || p.id,
        kind: p.id === 'local' ? 'password'
          : p.id === 'saml' ? 'saml-redirect' : 'oauth-redirect',
        startUrl: p.id === 'local' ? null : `/auth/${p.id}`,
      }))
    );
  });

  router.post('/refresh', async (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'no refresh token' });
    const record = await findValidRefreshToken(token);
    if (!record) {
      res.clearCookie(COOKIE_NAME, cookieOptions());
      return res.status(401).json({ error: 'invalid refresh token' });
    }
    const user = await User.findById(record.userId);
    await revokeRefreshToken(token); // rotate
    const accessToken = await completeLogin(res, user);
    res.json({ accessToken });
  });

  router.post('/logout', async (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    if (token) await revokeRefreshToken(token);
    res.clearCookie(COOKIE_NAME, cookieOptions());
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, async (req, res) => {
    const user = await User.findById(req.user.sub).select('email displayName providers');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  });

  return router;
}
```

- [ ] **Step 2: Verify (deferred)**

Full verification happens in Task 9 once the router is mounted with providers. No standalone run here.

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/routes/auth.js
git commit -m "feat: shared auth routes (providers, refresh, logout, me) and cookie helper"
```

---

## Task 9: Provider registry + local provider + wiring

**Files:**
- Create: `auth-api/src/providers/local.js`
- Create: `auth-api/src/providers/index.js`
- Modify: `auth-api/src/app.js`

- [ ] **Step 1: Create `auth-api/src/providers/local.js`**

```js
import bcrypt from 'bcrypt';
import { Strategy as LocalStrategy } from 'passport-local';
import { User } from '../models/User.js';
import { completeLogin } from '../routes/auth.js';

export default {
  id: 'local',
  register(passport, router, config, deps) {
    passport.use(
      new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
        try {
          const user = await User.findOne({ email: String(email).toLowerCase().trim() });
          if (!user || !user.passwordHash) return done(null, false);
          const ok = await bcrypt.compare(password, user.passwordHash);
          return ok ? done(null, user) : done(null, false);
        } catch (err) {
          return done(err);
        }
      })
    );

    router.post('/local/register', async (req, res) => {
      const { email, password, displayName } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'email and password required' });
      const normalized = String(email).toLowerCase().trim();
      if (await User.findOne({ email: normalized })) {
        return res.status(409).json({ error: 'email already registered' });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({
        email: normalized,
        displayName: displayName || normalized,
        passwordHash,
        providers: [{ provider: 'local', providerUserId: normalized }],
      });
      const accessToken = await completeLogin(res, user);
      res.status(201).json({ accessToken });
    });

    router.post('/local/login', (req, res, next) => {
      passport.authenticate('local', { session: false }, async (err, user) => {
        if (err) return next(err);
        if (!user) return res.status(401).json({ error: 'invalid credentials' });
        const accessToken = await completeLogin(res, user);
        res.json({ accessToken });
      })(req, res, next);
    });
  },
};
```

- [ ] **Step 2: Create `auth-api/src/providers/index.js`**

```js
import passport from 'passport';
import local from './local.js';
import google from './google.js';
import saml from './saml.js';

const MODULES = { local, google, saml };

// Mount only the enabled providers' strategies and routes.
export function mountProviders(router, enabledProviders, deps) {
  for (const p of enabledProviders) {
    const mod = MODULES[p.id];
    if (!mod) throw new Error(`[providers] no module for "${p.id}"`);
    mod.register(passport, router, p, deps);
    console.log(`[providers] mounted ${p.id}`);
  }
  return passport;
}
```

> Note: `google.js` and `saml.js` are created in Tasks 10–11. Until then, temporarily comment out their imports and the corresponding `MODULES` entries to run local-only, OR set only `local.enabled = true` in `auth.config.json`. Re-enable when Tasks 10–11 land.

- [ ] **Step 3: Modify `auth-api/src/app.js`** — replace its full contents with:

```js
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { createAuthRouter } from './routes/auth.js';
import { mountProviders } from './providers/index.js';

export function createApp(config) {
  const app = express();
  app.use(cors({ origin: process.env.WEB_URL, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(passport.initialize());

  app.get('/health', (req, res) => res.json({ ok: true }));

  const authRouter = createAuthRouter(config.enabled);
  mountProviders(authRouter, config.enabled, {});
  app.use('/auth', authRouter);

  return app;
}
```

- [ ] **Step 4: Modify `auth-api/src/server.js`** — load config and pass it in. Replace contents with:

```js
import { createApp } from './app.js';
import { connectDb } from './db/connect.js';
import { loadConfig } from './config/configLoader.js';

const PORT = process.env.PORT || 4000;

async function main() {
  const config = loadConfig();
  await connectDb(process.env.MONGO_URL);
  const app = createApp(config);
  app.listen(PORT, () => console.log(`[auth-api] listening on ${PORT}`));
}

main().catch((err) => {
  console.error('[auth-api] fatal', err);
  process.exit(1);
});
```

- [ ] **Step 5: Verify (local end-to-end)**

With mongo up and `auth.config.json` having only `local.enabled = true` (or Tasks 10–11 complete), from `auth-api/`:
```bash
export MONGO_URL=mongodb://localhost:27017/auth JWT_ACCESS_SECRET=a JWT_REFRESH_SECRET=b WEB_URL=http://localhost:5173 AUTH_CONFIG_PATH=../auth.config.json
node src/server.js &
curl -s localhost:4000/auth/providers
curl -s -c cj.txt -X POST localhost:4000/auth/local/register -H 'Content-Type: application/json' -d '{"email":"u@x.com","password":"secret123"}'
TOKEN=$(curl -s -b cj.txt -X POST localhost:4000/auth/local/login -H 'Content-Type: application/json' -d '{"email":"u@x.com","password":"secret123"}' | python -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
curl -s -b cj.txt localhost:4000/auth/me -H "Authorization: Bearer $TOKEN"
curl -s -b cj.txt -X POST localhost:4000/auth/refresh
```
Expected: `/providers` lists `local`; register returns `201` with an `accessToken`; `/me` returns the user JSON; `/refresh` returns a new `accessToken`.

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/providers/local.js auth-api/src/providers/index.js auth-api/src/app.js auth-api/src/server.js
git commit -m "feat: provider registry, local email/password provider, app wiring"
```

---

## Task 10: Google OAuth provider

**Files:**
- Create: `auth-api/src/providers/google.js`

- [ ] **Step 1: Create `auth-api/src/providers/google.js`**

```js
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { findOrCreateByProvider } from '../services/users.js';
import { completeLogin } from '../routes/auth.js';

export default {
  id: 'google',
  register(passport, router, config) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.clientID,
          clientSecret: config.clientSecret,
          callbackURL: config.callbackURL,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) return done(new Error('no email from Google'));
            const user = await findOrCreateByProvider({
              email,
              displayName: profile.displayName,
              provider: 'google',
              providerUserId: profile.id,
            });
            return done(null, user);
          } catch (err) {
            return done(err);
          }
        }
      )
    );

    router.get('/google', passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
    }));

    router.get('/google/callback', (req, res, next) => {
      passport.authenticate('google', { session: false }, async (err, user) => {
        const webUrl = process.env.WEB_URL;
        if (err || !user) return res.redirect(`${webUrl}/?error=google_failed`);
        const accessToken = await completeLogin(res, user);
        // Hand the access token to the SPA via URL fragment (refresh is in cookie).
        return res.redirect(`${webUrl}/#access_token=${accessToken}`);
      })(req, res, next);
    });
  },
};
```

- [ ] **Step 2: Verify**

Requires real Google credentials (`GOOGLE_CLIENT_ID`/`SECRET` with `http://localhost:4000/auth/google/callback` registered). With them set, boot the server and open `http://localhost:4000/auth/google` in a browser.
Expected: redirect to Google's consent screen; after consent, redirect back to `http://localhost:5173/#access_token=...`. Without credentials, confirm boot still succeeds and `/auth/providers` includes `google` (strategy registration must not throw).

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/providers/google.js
git commit -m "feat: google oauth provider with account linking"
```

---

## Task 11: SAML provider

**Files:**
- Create: `auth-api/src/providers/saml.js`

- [ ] **Step 1: Create `auth-api/src/providers/saml.js`**

```js
import { Strategy as SamlStrategy } from '@node-saml/passport-saml';
import { findOrCreateByProvider } from '../services/users.js';
import { completeLogin } from '../routes/auth.js';

// The test-saml-idp image's PEM cert may arrive base64-encoded; normalize it.
function normalizeCert(value) {
  if (value.includes('BEGIN CERTIFICATE')) return value;
  return Buffer.from(value, 'base64').toString('utf8');
}

export default {
  id: 'saml',
  register(passport, router, config) {
    passport.use(
      'saml',
      new SamlStrategy(
        {
          entryPoint: config.entryPoint,
          issuer: config.issuer,
          callbackUrl: config.callbackURL,
          idpCert: normalizeCert(config.cert),
          wantAssertionsSigned: false,
        },
        async (profile, done) => {
          try {
            const email = profile.email || profile.nameID;
            const user = await findOrCreateByProvider({
              email,
              displayName: profile.displayName || email,
              provider: 'saml',
              providerUserId: profile.nameID,
            });
            return done(null, user);
          } catch (err) {
            return done(err);
          }
        },
        (profile, done) => done(null, {}) // logout verify (unused)
      )
    );

    router.get('/saml', passport.authenticate('saml', { session: false }));

    router.post('/saml/callback', (req, res, next) => {
      passport.authenticate('saml', { session: false }, async (err, user) => {
        const webUrl = process.env.WEB_URL;
        if (err || !user) return res.redirect(`${webUrl}/?error=saml_failed`);
        const accessToken = await completeLogin(res, user);
        return res.redirect(`${webUrl}/#access_token=${accessToken}`);
      })(req, res, next);
    });
  },
};
```

- [ ] **Step 2: Get the test IdP cert into env**

Run: `docker compose up -d test-saml-idp` then extract its cert:
`docker compose exec test-saml-idp cat /var/www/simplesamlphp/cert/server.crt`
Copy the PEM (or base64 it) into `.env` as `SAML_IDP_CERT`. The `normalizeCert` helper accepts either form.

- [ ] **Step 3: Verify**

The test-saml-idp image ships a demo user (`user1` / `user1pass`). Boot auth-api + test-saml-idp, open `http://localhost:4000/auth/saml`.
Expected: redirect to the simpleSAMLphp login; after logging in as `user1`, the IdP POSTs to `/auth/saml/callback` and you land on `http://localhost:5173/#access_token=...`. Confirm a user with the demo email now exists in Mongo.

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/providers/saml.js
git commit -m "feat: saml provider against test-saml-idp with account linking"
```

---

## Task 12: Mailer service

**Files:**
- Create: `auth-api/src/services/mailer.js`

- [ ] **Step 1: Create `auth-api/src/services/mailer.js`**

```js
import nodemailer from 'nodemailer';

let transport = null;

function getTransport() {
  if (transport) return transport;
  if (!process.env.SMTP_HOST) return null; // dev: no SMTP configured
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

export async function sendPasswordReset(email, resetUrl) {
  const t = getTransport();
  if (!t) {
    console.log(`[mailer:dev] password reset for ${email}: ${resetUrl}`);
    return;
  }
  await t.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: 'Reset your password',
    text: `Reset your password using this link: ${resetUrl}`,
    html: `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
  });
}
```

- [ ] **Step 2: Verify**

Run (from `auth-api/`): `node -e "import('./src/services/mailer.js').then(m=>m.sendPasswordReset('u@x.com','http://localhost:5173/reset?token=abc'))"`
Expected (no `SMTP_HOST`): console prints `[mailer:dev] password reset for u@x.com: http://localhost:5173/reset?token=abc`.

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/services/mailer.js
git commit -m "feat: mailer service with dev console fallback"
```

---

## Task 13: Password reset endpoints

**Files:**
- Modify: `auth-api/src/providers/local.js` (add two routes + imports)

- [ ] **Step 1: Add imports at the top of `auth-api/src/providers/local.js`**

Add below the existing imports:

```js
import crypto from 'node:crypto';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { sendPasswordReset } from '../services/mailer.js';
import { revokeAllForUser } from '../services/tokens.js';

function sha256(v) {
  return crypto.createHash('sha256').update(v).digest('hex');
}
```

- [ ] **Step 2: Add the two routes** inside `register(...)`, after the `/local/login` route:

```js
    router.post('/local/forgot-password', async (req, res) => {
      const { email } = req.body || {};
      const normalized = String(email || '').toLowerCase().trim();
      const user = normalized ? await User.findOne({ email: normalized }) : null;
      // Always 200 — never reveal whether the account exists.
      if (user && user.passwordHash) {
        const raw = crypto.randomBytes(32).toString('hex');
        await PasswordResetToken.create({
          userId: user._id,
          tokenHash: sha256(raw),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        });
        const resetUrl = `${process.env.WEB_URL}/reset?token=${raw}`;
        await sendPasswordReset(user.email, resetUrl);
      }
      res.json({ ok: true });
    });

    router.post('/local/reset-password', async (req, res) => {
      const { token, password } = req.body || {};
      if (!token || !password) return res.status(400).json({ error: 'token and password required' });
      const record = await PasswordResetToken.findOne({ tokenHash: sha256(token) });
      if (!record || record.usedAt || record.expiresAt < new Date()) {
        return res.status(400).json({ error: 'invalid or expired token' });
      }
      const user = await User.findById(record.userId);
      if (!user) return res.status(400).json({ error: 'invalid or expired token' });
      user.passwordHash = await bcrypt.hash(password, 12);
      await user.save();
      record.usedAt = new Date();
      await record.save();
      await revokeAllForUser(user._id); // force re-login everywhere
      res.json({ ok: true });
    });
```

- [ ] **Step 3: Verify**

With server up and a registered `u@x.com` (from Task 9):
```bash
curl -s -X POST localhost:4000/auth/local/forgot-password -H 'Content-Type: application/json' -d '{"email":"u@x.com"}'
# read the reset link from the [mailer:dev] console line, copy the token:
curl -s -X POST localhost:4000/auth/local/reset-password -H 'Content-Type: application/json' -d '{"token":"<paste>","password":"newsecret123"}'
curl -s -b cj.txt -X POST localhost:4000/auth/local/login -H 'Content-Type: application/json' -d '{"email":"u@x.com","password":"newsecret123"}'
```
Expected: forgot returns `{"ok":true}` and logs the link; reset returns `{"ok":true}`; login with the new password returns an `accessToken`. Login with the old password returns `401`.

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/providers/local.js
git commit -m "feat: password reset (forgot + reset) endpoints for local provider"
```

---

## Task 14: Frontend scaffold (Vite + React 19 + TS)

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/tsconfig.json`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host --port 5173",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host --port 5173"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.0",
    "vite": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create `web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
});
```

- [ ] **Step 3: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Auth Demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `web/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 6: Create `web/src/App.tsx`** (placeholder, fleshed out in Task 17)

```tsx
export default function App() {
  return <h1>Auth Demo</h1>;
}
```

- [ ] **Step 7: Verify**

Run (from `web/`): `npm install && npm run dev`
Expected: Vite serves on `http://localhost:5173` showing "Auth Demo".

- [ ] **Step 8: Commit**

```bash
git add web/package.json web/vite.config.ts web/tsconfig.json web/index.html web/src/main.tsx web/src/App.tsx
git commit -m "feat: vite react ts frontend scaffold"
```

---

## Task 15: Frontend API client + auth context

**Files:**
- Create: `web/src/api.ts`
- Create: `web/src/authContext.tsx`

- [ ] **Step 1: Create `web/src/api.ts`**

```ts
const API = 'http://localhost:4000';

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

export type Provider = {
  id: string;
  displayName: string;
  kind: 'password' | 'oauth-redirect' | 'saml-redirect';
  startUrl: string | null;
};

export async function fetchProviders(): Promise<Provider[]> {
  const r = await fetch(`${API}/auth/providers`);
  return r.json();
}

export async function apiPost(path: string, body: unknown) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `request failed (${r.status})`);
  return data;
}

export async function refresh(): Promise<string | null> {
  const r = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!r.ok) return null;
  const data = await r.json();
  return data.accessToken;
}

export async function fetchMe() {
  const r = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  });
  if (!r.ok) return null;
  return r.json();
}

export async function logout() {
  await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
  setAccessToken(null);
}

export const oauthUrl = (startUrl: string) => `${API}${startUrl}`;
```

- [ ] **Step 2: Create `web/src/authContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { fetchMe, refresh, setAccessToken, logout as apiLogout } from './api';

type User = { email: string; displayName: string; providers: { provider: string }[] };
type AuthState = { user: User | null; loading: boolean; reload: () => Promise<void>; signOut: () => Promise<void> };

const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    // Pick up an access token left in the URL fragment by OAuth/SAML callbacks.
    const frag = new URLSearchParams(window.location.hash.slice(1));
    const fromFragment = frag.get('access_token');
    if (fromFragment) {
      setAccessToken(fromFragment);
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      const t = await refresh();
      if (t) setAccessToken(t);
    }
    setUser(await fetchMe());
    setLoading(false);
  }

  async function signOut() {
    await apiLogout();
    setUser(null);
  }

  useEffect(() => { reload(); }, []);

  return <Ctx.Provider value={{ user, loading, reload, signOut }}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 3: Verify**

Type-check only: from `web/`, run `npx tsc -b`.
Expected: no type errors. (Behavioral verification happens in Task 17.)

- [ ] **Step 4: Commit**

```bash
git add web/src/api.ts web/src/authContext.tsx
git commit -m "feat: frontend api client and auth context"
```

---

## Task 16: LoginWidget

**Files:**
- Create: `web/src/LoginWidget.tsx`

- [ ] **Step 1: Create `web/src/LoginWidget.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { fetchProviders, apiPost, oauthUrl, setAccessToken, Provider } from './api';
import { useAuth } from './authContext';

export function LoginWidget() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { reload } = useAuth();

  useEffect(() => { fetchProviders().then(setProviders); }, []);

  async function submitLocal(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { accessToken } = await apiPost('/auth/local/login', { email, password });
      setAccessToken(accessToken);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const local = providers.find((p) => p.kind === 'password');
  const redirects = providers.filter((p) => p.kind !== 'password');

  return (
    <div style={{ maxWidth: 320, display: 'grid', gap: 12 }}>
      {local && (
        <form onSubmit={submitLocal} style={{ display: 'grid', gap: 8 }}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit">Sign in</button>
          <a href="/forgot">Forgot password?</a>
        </form>
      )}
      {redirects.map((p) => (
        <a key={p.id} href={oauthUrl(p.startUrl!)}>
          <button type="button">Continue with {p.displayName}</button>
        </a>
      ))}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Type-check from `web/`: `npx tsc -b`. Expected: no errors. Visual check happens in Task 17.

- [ ] **Step 3: Commit**

```bash
git add web/src/LoginWidget.tsx
git commit -m "feat: LoginWidget rendering only enabled providers"
```

---

## Task 17: Password reset pages + App routing

**Files:**
- Create: `web/src/ForgotPassword.tsx`
- Create: `web/src/ResetPassword.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create `web/src/ForgotPassword.tsx`**

```tsx
import { useState } from 'react';
import { apiPost } from './api';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await apiPost('/auth/local/forgot-password', { email });
    setSent(true); // always show success — no account enumeration
  }

  if (sent) return <p>If that email has an account, a reset link is on its way.</p>;
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <h2>Forgot password</h2>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit">Send reset link</button>
    </form>
  );
}
```

- [ ] **Step 2: Create `web/src/ResetPassword.tsx`**

```tsx
import { useState } from 'react';
import { apiPost } from './api';

export function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await apiPost('/auth/local/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (done) return <p>Password updated. <a href="/">Sign in</a>.</p>;
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <h2>Choose a new password</h2>
      <input placeholder="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="submit">Reset password</button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Replace `web/src/App.tsx`** with minimal path-based routing:

```tsx
import { AuthProvider, useAuth } from './authContext';
import { LoginWidget } from './LoginWidget';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';

function Home() {
  const { user, loading, signOut } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (user) {
    return (
      <div>
        <h1>Welcome, {user.displayName || user.email}</h1>
        <p>Linked: {user.providers.map((p) => p.provider).join(', ')}</p>
        <button onClick={signOut}>Sign out</button>
      </div>
    );
  }
  return <LoginWidget />;
}

export default function App() {
  const path = window.location.pathname;
  if (path === '/forgot') return <ForgotPassword />;
  if (path === '/reset') return <ResetPassword />;
  return (
    <AuthProvider>
      <Home />
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Verify (full browser flow)**

With mongo, auth-api, and `npm run dev` (web) all running:
1. Open `http://localhost:5173` → LoginWidget shows the password form + "Continue with Google" + "Continue with SAML SSO" (whatever is enabled).
2. Register via curl (Task 9), then sign in through the form → page shows "Welcome…".
3. Sign out → back to the widget.
4. Visit `/forgot`, submit your email → check the auth-api console for the `[mailer:dev]` link → open `/reset?token=…`, set a new password → sign in with it.
Expected: each step behaves as described.

- [ ] **Step 5: Commit**

```bash
git add web/src/ForgotPassword.tsx web/src/ResetPassword.tsx web/src/App.tsx
git commit -m "feat: forgot/reset password pages and app routing"
```

---

## Task 18: Web Dockerfile + full compose bring-up

**Files:**
- Create: `web/Dockerfile`
- Create: `web/.dockerignore`

- [ ] **Step 1: Create `web/Dockerfile`** (build + serve with Vite preview)

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 5173
CMD ["npm", "run", "preview"]
```

- [ ] **Step 2: Create `web/.dockerignore`**

```
node_modules
dist
```

- [ ] **Step 3: Verify (whole system under compose)**

Run: `cp .env.example .env` (fill Google/SAML/SMTP as available), then `docker compose up --build`.
Expected: `mongo`, `auth-api`, `web`, `test-saml-idp` all start. `http://localhost:5173` serves the app; `curl localhost:4000/auth/providers` lists the enabled providers. Toggle `google.enabled` to `false` in `auth.config.json`, restart `auth-api`, and confirm the Google button disappears from the widget — proving the plug-and-play config path.

- [ ] **Step 4: Commit**

```bash
git add web/Dockerfile web/.dockerignore
git commit -m "feat: web dockerfile and full compose bring-up"
```

---

## Task 19: README + final plug-and-play verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`** documenting: prerequisites, `cp .env.example .env`, how to set Google creds, how to pull the SAML cert (Task 11 Step 2), `docker compose up --build`, the demo SAML user (`user1`/`user1pass`), and how to enable/disable a provider by editing `auth.config.json` (no code changes).

- [ ] **Step 2: Verify the core thesis**

With the stack up:
1. All three buttons appear when all enabled.
2. Set `"saml": { "enabled": false }` in `auth.config.json`, restart `auth-api`.
3. Reload `http://localhost:5173`.
Expected: SAML button is gone, `/auth/providers` no longer lists `saml`, and `/auth/saml` returns 404 — provider fully unmounted via config alone.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: readme and plug-and-play verification steps"
```

---

## Self-Review Notes

- **Spec coverage:** provider registry (T9), local (T9), google (T10), saml (T11), `GET /auth/providers` (T8), refresh/logout/me (T8), httpOnly rotating refresh (T5/T8), account linking (T6), password reset + mailer + model (T12/T13/T4), LoginWidget discovery (T16), reset pages (T17), 4-service compose (T1/T18), config example with `env:` markers (T1/T3). All spec sections map to a task.
- **Type consistency:** `completeLogin(res, user)` defined in T8 and used by T9/T10/T11; `findOrCreateByProvider` defined T6, used T10/T11; `revokeAllForUser` defined T5, used T13; `Provider` type defined T15, used T16. Cookie name `refresh_token` and path `/auth` consistent across T8.
- **Ordering caveat:** T9 creates `providers/index.js` which imports google/saml (T10/T11). The note in T9 Step 2 covers running local-only until T10/T11 land; if executing strictly in order, keep only `local` enabled in `auth.config.json` through T9, then enable the rest.
