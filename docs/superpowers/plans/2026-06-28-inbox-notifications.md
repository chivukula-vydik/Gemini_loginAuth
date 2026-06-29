# Inbox, Notifications & My Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-panel notification system (Inbox for wishes/praise/comments, Notifications for likes/approvals), a birthday wish flow, and a "My Posts" archive tab to the home page.

**Architecture:** Two new Mongoose models (`InboxMessage`, `Notification`) with dedicated routers. Notification triggers are fire-and-forget side-effects injected into existing route handlers (feed, leave, claims). Frontend adds bell+envelope icons with dropdown panels in the AppShell, a wish modal on the home page, and a "My Posts" tab in the feed.

**Tech Stack:** Node.js/Express (ESM), Mongoose/MongoDB, React/TypeScript/Vite, `node:test` + supertest + mongodb-memory-server

## Global Constraints

- Node ESM modules (`import`/`export`), no CommonJS
- Tests use `node --test` (NOT vitest/jest)
- Auth via `requireAuth` middleware
- Frontend fetches use `authed()` from `web/src/fetchHelper.ts`
- Notification creation is fire-and-forget — must never break the primary operation

---

### Task 1: InboxMessage and Notification Mongoose Models

**Files:**
- Create: `auth-api/src/models/InboxMessage.js`
- Create: `auth-api/src/models/Notification.js`
- Test: `auth-api/test/inbox-notification-models.test.js`

**Interfaces:**
- Produces: `InboxMessage` model, `INBOX_TYPES` constant `['birthday_wish', 'praise', 'comment']`, `Notification` model, `NOTIFICATION_TYPES` constant `['like', 'leave_approved', 'leave_rejected', 'timesheet_approved', 'claim_approved', 'claim_denied', 'mention']`

- [ ] **Step 1: Write failing tests**

Create `auth-api/test/inbox-notification-models.test.js`:

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const { InboxMessage, INBOX_TYPES } = await import('../src/models/InboxMessage.js');
const { Notification, NOTIFICATION_TYPES } = await import('../src/models/Notification.js');

test('INBOX_TYPES constant', () => {
  assert.deepEqual(INBOX_TYPES, ['birthday_wish', 'praise', 'comment']);
});

test('NOTIFICATION_TYPES constant', () => {
  assert.deepEqual(NOTIFICATION_TYPES, ['like', 'leave_approved', 'leave_rejected', 'timesheet_approved', 'claim_approved', 'claim_denied', 'mention']);
});

test('InboxMessage: creates with defaults', async () => {
  const sender = new mongoose.Types.ObjectId();
  const recipient = new mongoose.Types.ObjectId();
  const msg = await InboxMessage.create({ recipient, sender, type: 'birthday_wish', body: 'Happy Birthday!' });
  assert.equal(msg.type, 'birthday_wish');
  assert.equal(msg.read, false);
  assert.equal(msg.refItem, null);
  assert.ok(msg.createdAt);
});

test('InboxMessage: creates with refItem', async () => {
  const sender = new mongoose.Types.ObjectId();
  const recipient = new mongoose.Types.ObjectId();
  const refItem = new mongoose.Types.ObjectId();
  const msg = await InboxMessage.create({ recipient, sender, type: 'praise', body: 'Great work!', refItem });
  assert.equal(String(msg.refItem), String(refItem));
});

test('Notification: creates with defaults', async () => {
  const actor = new mongoose.Types.ObjectId();
  const recipient = new mongoose.Types.ObjectId();
  const refItem = new mongoose.Types.ObjectId();
  const notif = await Notification.create({ recipient, actor, type: 'like', refItem, refModel: 'FeedItem' });
  assert.equal(notif.type, 'like');
  assert.equal(notif.read, false);
  assert.equal(notif.refModel, 'FeedItem');
  assert.ok(notif.createdAt);
});

test('Notification: creates approval type', async () => {
  const actor = new mongoose.Types.ObjectId();
  const recipient = new mongoose.Types.ObjectId();
  const refItem = new mongoose.Types.ObjectId();
  const notif = await Notification.create({ recipient, actor, type: 'leave_approved', refItem, refModel: 'Leave' });
  assert.equal(notif.type, 'leave_approved');
  assert.equal(notif.refModel, 'Leave');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd auth-api && node --test test/inbox-notification-models.test.js`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement InboxMessage model**

Create `auth-api/src/models/InboxMessage.js`:

```js
import mongoose from 'mongoose';

export const INBOX_TYPES = ['birthday_wish', 'praise', 'comment'];

const inboxMessageSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:      { type: String, enum: INBOX_TYPES, required: true },
  body:      { type: String, required: true },
  refItem:   { type: mongoose.Schema.Types.ObjectId, ref: 'FeedItem', default: null },
  read:      { type: Boolean, default: false },
}, { timestamps: true });

inboxMessageSchema.index({ recipient: 1, createdAt: -1 });
inboxMessageSchema.index({ recipient: 1, read: 1 });

export const InboxMessage = mongoose.model('InboxMessage', inboxMessageSchema);
```

- [ ] **Step 4: Implement Notification model**

Create `auth-api/src/models/Notification.js`:

```js
import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'like', 'leave_approved', 'leave_rejected',
  'timesheet_approved', 'claim_approved', 'claim_denied', 'mention',
];

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actor:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:      { type: String, enum: NOTIFICATION_TYPES, required: true },
  refItem:   { type: mongoose.Schema.Types.ObjectId, default: null },
  refModel:  { type: String, enum: ['FeedItem', 'Leave', 'ClaimRequest'], default: null },
  read:      { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd auth-api && node --test test/inbox-notification-models.test.js`
Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/models/InboxMessage.js auth-api/src/models/Notification.js auth-api/test/inbox-notification-models.test.js
git commit -m "feat(inbox): add InboxMessage and Notification models with tests"
```

---

### Task 2: Inbox Router and Notifications Router

**Files:**
- Create: `auth-api/src/routes/inbox.js`
- Create: `auth-api/src/routes/notifications.js`
- Modify: `auth-api/src/app.js` (add imports and mount)
- Test: `auth-api/test/inbox-routes.test.js`
- Test: `auth-api/test/notification-routes.test.js`

**Interfaces:**
- Consumes: `InboxMessage`, `Notification` models from Task 1
- Produces: `createInboxRouter()` — endpoints `GET /inbox`, `GET /inbox/unread-count`, `POST /inbox/wish`, `POST /inbox/:id/read`, `POST /inbox/read-all`; `createNotificationsRouter()` — endpoints `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`

- [ ] **Step 1: Write failing inbox route tests**

Create `auth-api/test/inbox-routes.test.js`:

```js
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { InboxMessage } = await import('../src/models/InboxMessage.js');
const { signAccessToken } = await import('../src/services/tokens.js');

let mongod, app;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp({ enabled: [] });
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function bearer(user) {
  return `Bearer ${signAccessToken(user)}`;
}

describe('POST /inbox/wish', () => {
  test('creates birthday wish for recipient', async () => {
    const sender = await User.create({ email: 'iw1@x.com', displayName: 'IW1', roles: ['employee'] });
    const recipient = await User.create({ email: 'iw2@x.com', displayName: 'IW2', roles: ['employee'] });
    const res = await request(app)
      .post('/inbox/wish')
      .set('Authorization', bearer(sender))
      .send({ recipientId: recipient._id, body: 'Happy Birthday!' });
    assert.equal(res.status, 201);
    assert.equal(res.body.type, 'birthday_wish');
    assert.equal(String(res.body.recipient), String(recipient._id));
  });

  test('rejects wishing yourself', async () => {
    const user = await User.create({ email: 'iw3@x.com', displayName: 'IW3', roles: ['employee'] });
    const res = await request(app)
      .post('/inbox/wish')
      .set('Authorization', bearer(user))
      .send({ recipientId: user._id, body: 'Happy Birthday me!' });
    assert.equal(res.status, 400);
  });
});

describe('GET /inbox', () => {
  test('returns only caller messages, newest first', async () => {
    const user = await User.create({ email: 'ig1@x.com', displayName: 'IG1', roles: ['employee'] });
    const other = await User.create({ email: 'ig2@x.com', displayName: 'IG2', roles: ['employee'] });
    await InboxMessage.create({ recipient: user._id, sender: other._id, type: 'birthday_wish', body: 'First' });
    await InboxMessage.create({ recipient: user._id, sender: other._id, type: 'praise', body: 'Second' });
    await InboxMessage.create({ recipient: other._id, sender: user._id, type: 'birthday_wish', body: 'Not mine' });

    const res = await request(app)
      .get('/inbox')
      .set('Authorization', bearer(user));
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 2);
    assert.equal(res.body.items[0].body, 'Second');
  });
});

describe('GET /inbox/unread-count', () => {
  test('returns correct unread count', async () => {
    const user = await User.create({ email: 'ic1@x.com', displayName: 'IC1', roles: ['employee'] });
    const other = await User.create({ email: 'ic2@x.com', displayName: 'IC2', roles: ['employee'] });
    await InboxMessage.create({ recipient: user._id, sender: other._id, type: 'birthday_wish', body: 'Unread' });
    await InboxMessage.create({ recipient: user._id, sender: other._id, type: 'praise', body: 'Read', read: true });

    const res = await request(app)
      .get('/inbox/unread-count')
      .set('Authorization', bearer(user));
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
  });
});

describe('POST /inbox/:id/read', () => {
  test('marks message as read', async () => {
    const user = await User.create({ email: 'ir1@x.com', displayName: 'IR1', roles: ['employee'] });
    const other = await User.create({ email: 'ir2@x.com', displayName: 'IR2', roles: ['employee'] });
    const msg = await InboxMessage.create({ recipient: user._id, sender: other._id, type: 'birthday_wish', body: 'Hi' });

    const res = await request(app)
      .post(`/inbox/${msg._id}/read`)
      .set('Authorization', bearer(user));
    assert.equal(res.status, 200);
    const check = await InboxMessage.findById(msg._id);
    assert.equal(check.read, true);
  });

  test('404 for other user message', async () => {
    const user = await User.create({ email: 'ir3@x.com', displayName: 'IR3', roles: ['employee'] });
    const other = await User.create({ email: 'ir4@x.com', displayName: 'IR4', roles: ['employee'] });
    const msg = await InboxMessage.create({ recipient: other._id, sender: user._id, type: 'birthday_wish', body: 'Hi' });

    const res = await request(app)
      .post(`/inbox/${msg._id}/read`)
      .set('Authorization', bearer(user));
    assert.equal(res.status, 404);
  });
});

describe('POST /inbox/read-all', () => {
  test('marks all caller messages as read', async () => {
    const user = await User.create({ email: 'ira1@x.com', displayName: 'IRA1', roles: ['employee'] });
    const other = await User.create({ email: 'ira2@x.com', displayName: 'IRA2', roles: ['employee'] });
    await InboxMessage.create({ recipient: user._id, sender: other._id, type: 'birthday_wish', body: 'A' });
    await InboxMessage.create({ recipient: user._id, sender: other._id, type: 'praise', body: 'B' });

    const res = await request(app)
      .post('/inbox/read-all')
      .set('Authorization', bearer(user));
    assert.equal(res.status, 200);
    const unread = await InboxMessage.countDocuments({ recipient: user._id, read: false });
    assert.equal(unread, 0);
  });
});
```

- [ ] **Step 2: Write failing notification route tests**

Create `auth-api/test/notification-routes.test.js`:

```js
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Notification } = await import('../src/models/Notification.js');
const { signAccessToken } = await import('../src/services/tokens.js');

let mongod, app;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp({ enabled: [] });
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function bearer(user) {
  return `Bearer ${signAccessToken(user)}`;
}

describe('GET /notifications', () => {
  test('returns only caller notifications, newest first', async () => {
    const user = await User.create({ email: 'ng1@x.com', displayName: 'NG1', roles: ['employee'] });
    const actor = await User.create({ email: 'ng2@x.com', displayName: 'NG2', roles: ['employee'] });
    await Notification.create({ recipient: user._id, actor: actor._id, type: 'like', refItem: new mongoose.Types.ObjectId(), refModel: 'FeedItem' });
    await Notification.create({ recipient: user._id, actor: actor._id, type: 'leave_approved', refItem: new mongoose.Types.ObjectId(), refModel: 'Leave' });
    await Notification.create({ recipient: actor._id, actor: user._id, type: 'like', refItem: new mongoose.Types.ObjectId(), refModel: 'FeedItem' });

    const res = await request(app)
      .get('/notifications')
      .set('Authorization', bearer(user));
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 2);
  });
});

describe('GET /notifications/unread-count', () => {
  test('returns correct unread count', async () => {
    const user = await User.create({ email: 'nc1@x.com', displayName: 'NC1', roles: ['employee'] });
    const actor = await User.create({ email: 'nc2@x.com', displayName: 'NC2', roles: ['employee'] });
    await Notification.create({ recipient: user._id, actor: actor._id, type: 'like', refItem: new mongoose.Types.ObjectId(), refModel: 'FeedItem' });
    await Notification.create({ recipient: user._id, actor: actor._id, type: 'like', refItem: new mongoose.Types.ObjectId(), refModel: 'FeedItem', read: true });

    const res = await request(app)
      .get('/notifications/unread-count')
      .set('Authorization', bearer(user));
    assert.equal(res.body.count, 1);
  });
});

describe('POST /notifications/:id/read', () => {
  test('marks as read', async () => {
    const user = await User.create({ email: 'nr1@x.com', displayName: 'NR1', roles: ['employee'] });
    const actor = await User.create({ email: 'nr2@x.com', displayName: 'NR2', roles: ['employee'] });
    const notif = await Notification.create({ recipient: user._id, actor: actor._id, type: 'like', refItem: new mongoose.Types.ObjectId(), refModel: 'FeedItem' });

    const res = await request(app)
      .post(`/notifications/${notif._id}/read`)
      .set('Authorization', bearer(user));
    assert.equal(res.status, 200);
    const check = await Notification.findById(notif._id);
    assert.equal(check.read, true);
  });

  test('404 for other user notification', async () => {
    const user = await User.create({ email: 'nr3@x.com', displayName: 'NR3', roles: ['employee'] });
    const other = await User.create({ email: 'nr4@x.com', displayName: 'NR4', roles: ['employee'] });
    const notif = await Notification.create({ recipient: other._id, actor: user._id, type: 'like', refItem: new mongoose.Types.ObjectId(), refModel: 'FeedItem' });

    const res = await request(app)
      .post(`/notifications/${notif._id}/read`)
      .set('Authorization', bearer(user));
    assert.equal(res.status, 404);
  });
});

describe('POST /notifications/read-all', () => {
  test('marks all as read', async () => {
    const user = await User.create({ email: 'nra1@x.com', displayName: 'NRA1', roles: ['employee'] });
    const actor = await User.create({ email: 'nra2@x.com', displayName: 'NRA2', roles: ['employee'] });
    await Notification.create({ recipient: user._id, actor: actor._id, type: 'like', refItem: new mongoose.Types.ObjectId(), refModel: 'FeedItem' });
    await Notification.create({ recipient: user._id, actor: actor._id, type: 'leave_approved', refItem: new mongoose.Types.ObjectId(), refModel: 'Leave' });

    const res = await request(app)
      .post('/notifications/read-all')
      .set('Authorization', bearer(user));
    assert.equal(res.status, 200);
    const unread = await Notification.countDocuments({ recipient: user._id, read: false });
    assert.equal(unread, 0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd auth-api && node --test test/inbox-routes.test.js test/notification-routes.test.js`
Expected: FAIL — routers not mounted

- [ ] **Step 4: Implement inbox router**

Create `auth-api/src/routes/inbox.js`:

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { InboxMessage } from '../models/InboxMessage.js';

export function createInboxRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // GET /inbox?cursor=<lastId>&limit=20
  router.get('/', asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const filter = { recipient: req.user.sub };
    if (req.query.cursor) filter._id = { $lt: req.query.cursor };

    const items = await InboxMessage.find(filter)
      .populate('sender', 'displayName email')
      .sort({ createdAt: -1 })
      .limit(limit);

    const cursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    res.json({ items, cursor });
  }));

  // GET /inbox/unread-count
  router.get('/unread-count', asyncHandler(async (req, res) => {
    const count = await InboxMessage.countDocuments({ recipient: req.user.sub, read: false });
    res.json({ count });
  }));

  // POST /inbox/wish
  router.post('/wish', asyncHandler(async (req, res) => {
    const { recipientId, body } = req.body;
    if (!recipientId) return res.status(400).json({ error: 'recipientId is required' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });
    if (String(recipientId) === String(req.user.sub)) {
      return res.status(400).json({ error: 'cannot wish yourself' });
    }
    const msg = await InboxMessage.create({
      recipient: recipientId,
      sender: req.user.sub,
      type: 'birthday_wish',
      body: body.trim(),
    });
    const populated = await InboxMessage.findById(msg._id).populate('sender', 'displayName email');
    res.status(201).json(populated);
  }));

  // POST /inbox/:id/read
  router.post('/:id/read', asyncHandler(async (req, res) => {
    const msg = await InboxMessage.findOne({ _id: req.params.id, recipient: req.user.sub });
    if (!msg) return res.status(404).json({ error: 'not found' });
    msg.read = true;
    await msg.save();
    res.json({ ok: true });
  }));

  // POST /inbox/read-all
  router.post('/read-all', asyncHandler(async (req, res) => {
    await InboxMessage.updateMany({ recipient: req.user.sub, read: false }, { read: true });
    res.json({ ok: true });
  }));

  return router;
}
```

- [ ] **Step 5: Implement notifications router**

Create `auth-api/src/routes/notifications.js`:

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Notification } from '../models/Notification.js';

export function createNotificationsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // GET /notifications?cursor=<lastId>&limit=20
  router.get('/', asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const filter = { recipient: req.user.sub };
    if (req.query.cursor) filter._id = { $lt: req.query.cursor };

    const items = await Notification.find(filter)
      .populate('actor', 'displayName email')
      .sort({ createdAt: -1 })
      .limit(limit);

    const cursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    res.json({ items, cursor });
  }));

  // GET /notifications/unread-count
  router.get('/unread-count', asyncHandler(async (req, res) => {
    const count = await Notification.countDocuments({ recipient: req.user.sub, read: false });
    res.json({ count });
  }));

  // POST /notifications/:id/read
  router.post('/:id/read', asyncHandler(async (req, res) => {
    const notif = await Notification.findOne({ _id: req.params.id, recipient: req.user.sub });
    if (!notif) return res.status(404).json({ error: 'not found' });
    notif.read = true;
    await notif.save();
    res.json({ ok: true });
  }));

  // POST /notifications/read-all
  router.post('/read-all', asyncHandler(async (req, res) => {
    await Notification.updateMany({ recipient: req.user.sub, read: false }, { read: true });
    res.json({ ok: true });
  }));

  return router;
}
```

- [ ] **Step 6: Mount both routers in app.js**

Add imports at top of `auth-api/src/app.js`:
```js
import { createInboxRouter } from './routes/inbox.js';
import { createNotificationsRouter } from './routes/notifications.js';
```

Add mount lines after the feed route:
```js
app.use('/inbox', createInboxRouter());
app.use('/notifications', createNotificationsRouter());
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd auth-api && node --test test/inbox-routes.test.js test/notification-routes.test.js`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add auth-api/src/routes/inbox.js auth-api/src/routes/notifications.js auth-api/src/app.js auth-api/test/inbox-routes.test.js auth-api/test/notification-routes.test.js
git commit -m "feat(inbox): add inbox and notifications routers with tests"
```

---

### Task 3: Notification Triggers + My Posts Endpoint

**Files:**
- Modify: `auth-api/src/routes/feed.js` (add triggers to like, comment, praise + add `/mine` endpoint)
- Modify: `auth-api/src/routes/leave.js` (add trigger to decide)
- Modify: `auth-api/src/routes/claimRequests.js` (add triggers to both decide endpoints)
- Test: `auth-api/test/notification-triggers.test.js`

**Interfaces:**
- Consumes: `InboxMessage`, `Notification` models, existing route handlers
- Produces: side-effect notification creation in existing handlers; `GET /feed/mine` endpoint

- [ ] **Step 1: Write failing trigger tests**

Create `auth-api/test/notification-triggers.test.js`:

```js
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { FeedItem } = await import('../src/models/FeedItem.js');
const { InboxMessage } = await import('../src/models/InboxMessage.js');
const { Notification } = await import('../src/models/Notification.js');
const { signAccessToken } = await import('../src/services/tokens.js');

let mongod, app;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp({ enabled: [] });
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function bearer(user) {
  return `Bearer ${signAccessToken(user)}`;
}

describe('Like triggers', () => {
  test('like creates notification for post author', async () => {
    const author = await User.create({ email: 'tl1@x.com', displayName: 'TL1', roles: ['employee'] });
    const liker = await User.create({ email: 'tl2@x.com', displayName: 'TL2', roles: ['employee'] });
    const post = await FeedItem.create({ type: 'post', author: author._id, body: 'Hello' });

    await request(app)
      .post(`/feed/${post._id}/like`)
      .set('Authorization', bearer(liker));

    const notif = await Notification.findOne({ recipient: author._id, type: 'like' });
    assert.ok(notif);
    assert.equal(String(notif.actor), String(liker._id));
    assert.equal(String(notif.refItem), String(post._id));
  });

  test('self-like does not create notification', async () => {
    const user = await User.create({ email: 'tl3@x.com', displayName: 'TL3', roles: ['employee'] });
    const post = await FeedItem.create({ type: 'post', author: user._id, body: 'My post' });

    await request(app)
      .post(`/feed/${post._id}/like`)
      .set('Authorization', bearer(user));

    const notif = await Notification.findOne({ recipient: user._id, type: 'like', refItem: post._id });
    assert.equal(notif, null);
  });

  test('duplicate like does not create duplicate notification', async () => {
    const author = await User.create({ email: 'tl4@x.com', displayName: 'TL4', roles: ['employee'] });
    const liker = await User.create({ email: 'tl5@x.com', displayName: 'TL5', roles: ['employee'] });
    const post = await FeedItem.create({ type: 'post', author: author._id, body: 'Dupe test' });

    await request(app).post(`/feed/${post._id}/like`).set('Authorization', bearer(liker));
    await request(app).post(`/feed/${post._id}/like`).set('Authorization', bearer(liker));
    await request(app).post(`/feed/${post._id}/like`).set('Authorization', bearer(liker));

    const count = await Notification.countDocuments({ recipient: author._id, type: 'like', refItem: post._id, actor: liker._id });
    assert.equal(count, 1);
  });
});

describe('Comment triggers', () => {
  test('comment creates inbox message for post author', async () => {
    const author = await User.create({ email: 'tc1@x.com', displayName: 'TC1', roles: ['employee'] });
    const commenter = await User.create({ email: 'tc2@x.com', displayName: 'TC2', roles: ['employee'] });
    const post = await FeedItem.create({ type: 'post', author: author._id, body: 'Comment me' });

    await request(app)
      .post(`/feed/${post._id}/comment`)
      .set('Authorization', bearer(commenter))
      .send({ body: 'Nice!' });

    const msg = await InboxMessage.findOne({ recipient: author._id, type: 'comment' });
    assert.ok(msg);
    assert.equal(msg.body, 'Nice!');
  });

  test('self-comment does not create inbox message', async () => {
    const user = await User.create({ email: 'tc3@x.com', displayName: 'TC3', roles: ['employee'] });
    const post = await FeedItem.create({ type: 'post', author: user._id, body: 'My post' });

    await request(app)
      .post(`/feed/${post._id}/comment`)
      .set('Authorization', bearer(user))
      .send({ body: 'Self comment' });

    const msg = await InboxMessage.findOne({ recipient: user._id, type: 'comment', refItem: post._id });
    assert.equal(msg, null);
  });
});

describe('Praise triggers', () => {
  test('praise creates inbox message for target', async () => {
    const sender = await User.create({ email: 'tp1@x.com', displayName: 'TP1', roles: ['employee'] });
    const target = await User.create({ email: 'tp2@x.com', displayName: 'TP2', roles: ['employee'] });

    const res = await request(app)
      .post('/feed')
      .set('Authorization', bearer(sender))
      .send({ type: 'praise', body: 'Awesome work!', praiseTarget: target._id, praiseCategory: 'teamwork' });

    const msg = await InboxMessage.findOne({ recipient: target._id, type: 'praise' });
    assert.ok(msg);
    assert.equal(msg.body, 'Awesome work!');
    assert.equal(String(msg.refItem), String(res.body._id));
  });
});

describe('GET /feed/mine', () => {
  test('returns only caller own posts', async () => {
    const user = await User.create({ email: 'fm1@x.com', displayName: 'FM1', roles: ['employee'] });
    const other = await User.create({ email: 'fm2@x.com', displayName: 'FM2', roles: ['employee'] });
    await FeedItem.deleteMany({});
    await FeedItem.create({ type: 'post', author: user._id, body: 'My post' });
    await FeedItem.create({ type: 'post', author: other._id, body: 'Not mine' });
    await FeedItem.create({ type: 'post', author: user._id, body: 'Hidden', status: 'hidden' });

    const res = await request(app)
      .get('/feed/mine')
      .set('Authorization', bearer(user));
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].body, 'My post');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd auth-api && node --test test/notification-triggers.test.js`
Expected: FAIL — triggers not implemented, `/feed/mine` returns 404

- [ ] **Step 3: Add notification triggers to feed.js**

In `auth-api/src/routes/feed.js`, add import at top:
```js
import { InboxMessage } from '../models/InboxMessage.js';
import { Notification } from '../models/Notification.js';
```

In the `POST /feed/:id/like` handler, after `res.json(...)`, add fire-and-forget notification (inside the `else` branch when a like is being added, i.e., when `!already`):
```js
    if (!already && String(item.author) !== String(uid)) {
      Notification.findOneAndUpdate(
        { recipient: item.author, actor: uid, type: 'like', refItem: item._id, read: false },
        { recipient: item.author, actor: uid, type: 'like', refItem: item._id, refModel: 'FeedItem' },
        { upsert: true },
      ).catch((e) => console.error('[notify] like error:', e.message));
    }
```

In the `POST /feed/:id/comment` handler, after `res.status(201).json(obj)`, add:
```js
    if (String(item.author) !== String(req.user.sub)) {
      InboxMessage.create({
        recipient: item.author,
        sender: req.user.sub,
        type: 'comment',
        body: body.trim(),
        refItem: item._id,
      }).catch((e) => console.error('[notify] comment error:', e.message));
    }
```

In the `POST /feed` handler (praise section), after `res.status(201).json(result)`, add:
```js
    if (type === 'praise' && praiseTarget) {
      InboxMessage.create({
        recipient: praiseTarget,
        sender: req.user.sub,
        type: 'praise',
        body: body.trim(),
        refItem: item._id,
      }).catch((e) => console.error('[notify] praise error:', e.message));
    }
```

Add the `/mine` endpoint before the `/:id` GET route (to avoid `:id` matching "mine"):
```js
  // GET /feed/mine — caller's own posts
  router.get('/mine', asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const filter = { author: req.user.sub, status: 'active' };
    if (req.query.cursor) filter._id = { $lt: req.query.cursor };

    const items = await FeedItem.find(filter)
      .populate('author', 'displayName email')
      .populate('praiseTarget', 'displayName email')
      .populate('comments.author', 'displayName email')
      .sort({ createdAt: -1 })
      .limit(limit);

    const userId = req.user.sub;
    const result = items.map((item) => sanitiseItem(item, userId));

    const cursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    res.json({ items: result, cursor });
  }));
```

- [ ] **Step 4: Add notification triggers to leave.js**

In `auth-api/src/routes/leave.js`, add import at top:
```js
import { Notification } from '../models/Notification.js';
```

In `PATCH /:id/decide`, after `doc.save()` and before the email sending block (after line `await doc.save();`), add:
```js
    const notifType = decision === 'approved' ? 'leave_approved' : 'leave_rejected';
    Notification.create({
      recipient: doc.userId,
      actor: req.user.sub,
      type: notifType,
      refItem: doc._id,
      refModel: 'Leave',
    }).catch((e) => console.error('[notify] leave error:', e.message));
```

- [ ] **Step 5: Add notification triggers to claimRequests.js**

In `auth-api/src/routes/claimRequests.js`, add import at top:
```js
import { Notification } from '../models/Notification.js';
```

In `PATCH /:id` (manager decide), after `res.json(claim)`, add:
```js
    Notification.create({
      recipient: claim.userId,
      actor: req.user.sub,
      type: decision === 'approved' ? 'claim_approved' : 'claim_denied',
      refItem: claim._id,
      refModel: 'ClaimRequest',
    }).catch((e) => console.error('[notify] claim error:', e.message));
```

In `PATCH /:id/finance-decide`, after `res.json(claim)`, add:
```js
    Notification.create({
      recipient: claim.userId,
      actor: req.user.sub,
      type: decision === 'approved' ? 'claim_approved' : 'claim_denied',
      refItem: claim._id,
      refModel: 'ClaimRequest',
    }).catch((e) => console.error('[notify] claim-finance error:', e.message));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd auth-api && node --test test/notification-triggers.test.js`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add auth-api/src/routes/feed.js auth-api/src/routes/leave.js auth-api/src/routes/claimRequests.js auth-api/test/notification-triggers.test.js
git commit -m "feat(inbox): add notification triggers to feed/leave/claims + /feed/mine endpoint"
```

---

### Task 4: Frontend — API Layer, Dropdown Components, AppShell Integration

**Files:**
- Create: `web/src/dashboard/inboxApi.ts`
- Create: `web/src/dashboard/NotificationDropdown.tsx`
- Modify: `web/src/AppShell.tsx` (add icons + dropdowns to top bar)
- Modify: `web/src/dashboard/feedApi.ts` (add `getMyFeed` function)
- Modify: `web/src/dashboard/HomePage.tsx` (add "My Posts" tab, wish modal)
- Modify: `web/src/dashboard/HomePage.css` (add notification dropdown styles)

**Interfaces:**
- Consumes: `authed()` from `fetchHelper.ts`, `useAuth()` from `authContext`
- Produces: `NotificationDropdown` component, inbox/notification API functions, updated AppShell with bell+envelope icons

- [ ] **Step 1: Create inbox/notification API layer**

Create `web/src/dashboard/inboxApi.ts`:

```ts
import { authed } from '../fetchHelper';

export interface InboxSender {
  _id: string;
  displayName: string;
  email: string;
}

export interface InboxItem {
  _id: string;
  sender: InboxSender;
  type: 'birthday_wish' | 'praise' | 'comment';
  body: string;
  refItem: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationActor {
  _id: string;
  displayName: string;
  email: string;
}

export interface NotificationItem {
  _id: string;
  actor: NotificationActor;
  type: 'like' | 'leave_approved' | 'leave_rejected' | 'timesheet_approved' | 'claim_approved' | 'claim_denied' | 'mention';
  refItem: string | null;
  refModel: string | null;
  read: boolean;
  createdAt: string;
}

export interface ListResponse<T> {
  items: T[];
  cursor: string | null;
}

export async function getInbox(cursor?: string): Promise<ListResponse<InboxItem>> {
  const q = cursor ? `?cursor=${cursor}` : '';
  return authed(`/inbox${q}`);
}

export async function getInboxUnreadCount(): Promise<{ count: number }> {
  return authed('/inbox/unread-count');
}

export async function markInboxRead(id: string): Promise<void> {
  return authed(`/inbox/${id}/read`, 'POST');
}

export async function markAllInboxRead(): Promise<void> {
  return authed('/inbox/read-all', 'POST');
}

export async function sendWish(recipientId: string, body: string): Promise<InboxItem> {
  return authed('/inbox/wish', 'POST', { recipientId, body });
}

export async function getNotifications(cursor?: string): Promise<ListResponse<NotificationItem>> {
  const q = cursor ? `?cursor=${cursor}` : '';
  return authed(`/notifications${q}`);
}

export async function getNotificationsUnreadCount(): Promise<{ count: number }> {
  return authed('/notifications/unread-count');
}

export async function markNotificationRead(id: string): Promise<void> {
  return authed(`/notifications/${id}/read`, 'POST');
}

export async function markAllNotificationsRead(): Promise<void> {
  return authed('/notifications/read-all', 'POST');
}
```

- [ ] **Step 2: Create NotificationDropdown component**

Create `web/src/dashboard/NotificationDropdown.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';

const AVATAR_COLORS = ['#4f6ef7', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#6b7280', '#ec4899', '#14b8a6'];
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export interface DropdownItem {
  _id: string;
  person: { _id: string; displayName: string } | null;
  text: string;
  read: boolean;
  createdAt: string;
  onClick: () => void;
}

export function NotificationDropdown({ title, icon, badge, items, onMarkAllRead, onClose }: {
  title: string;
  icon: React.ReactNode;
  badge: number;
  items: DropdownItem[];
  onMarkAllRead: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div className="nd-container" ref={ref}>
      <div className="nd-dropdown">
        <div className="nd-header">
          <span className="nd-title">{title}</span>
          {badge > 0 && (
            <button className="nd-mark-all" onClick={onMarkAllRead}>Mark all read</button>
          )}
        </div>
        <div className="nd-list">
          {items.length === 0 ? (
            <div className="nd-empty">No {title.toLowerCase()} yet</div>
          ) : (
            items.map((item) => (
              <div
                key={item._id}
                className={`nd-item ${!item.read ? 'nd-item--unread' : ''}`}
                onClick={item.onClick}
                role="button"
                tabIndex={0}
              >
                {item.person && (
                  <div className="nd-avatar" style={{ background: colorFor(item.person._id) }}>
                    {initials(item.person.displayName || 'FE')}
                  </div>
                )}
                <div className="nd-item-body">
                  <span className="nd-item-text">{item.text}</span>
                  <span className="nd-item-time">{timeAgo(item.createdAt)}</span>
                </div>
                {!item.read && <span className="nd-unread-dot" />}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add `getMyFeed` to feedApi.ts**

In `web/src/dashboard/feedApi.ts`, add at the end:

```ts
export async function getMyFeed(cursor?: string): Promise<FeedResponse> {
  const q = cursor ? `?cursor=${cursor}` : '';
  return authed(`/feed/mine${q}`);
}
```

- [ ] **Step 4: Update AppShell with inbox/notification icons**

In `web/src/AppShell.tsx`, add imports:
```tsx
import { NotificationDropdown, DropdownItem } from './dashboard/NotificationDropdown';
import {
  getInbox, getInboxUnreadCount, markInboxRead, markAllInboxRead,
  getNotifications, getNotificationsUnreadCount, markNotificationRead, markAllNotificationsRead,
  InboxItem, NotificationItem,
} from './dashboard/inboxApi';
```

Inside the `AppShell` function, before the `return`, add state and polling:
```tsx
  const [inboxCount, setInboxCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [showInbox, setShowInbox] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [notifItems, setNotifItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    function poll() {
      getInboxUnreadCount().then((r) => setInboxCount(r.count)).catch(() => {});
      getNotificationsUnreadCount().then((r) => setNotifCount(r.count)).catch(() => {});
    }
    poll();
    const id = setInterval(poll, 60000);
    return () => clearInterval(id);
  }, []);

  async function openInbox() {
    setShowNotifs(false);
    setShowInbox(!showInbox);
    if (!showInbox) {
      const res = await getInbox();
      setInboxItems(res.items);
    }
  }

  async function openNotifs() {
    setShowInbox(false);
    setShowNotifs(!showNotifs);
    if (!showNotifs) {
      const res = await getNotifications();
      setNotifItems(res.items);
    }
  }

  function inboxDropdownItems(): DropdownItem[] {
    return inboxItems.map((item) => {
      const name = item.sender?.displayName || 'Former Employee';
      const textMap: Record<string, string> = {
        birthday_wish: `${name} sent you a birthday wish: ${item.body}`,
        praise: `${name} praised you: ${item.body.slice(0, 60)}`,
        comment: `${name} commented on your post: ${item.body.slice(0, 60)}`,
      };
      return {
        _id: item._id,
        person: item.sender,
        text: textMap[item.type] || item.body,
        read: item.read,
        createdAt: item.createdAt,
        onClick: () => {
          markInboxRead(item._id).then(() => {
            setInboxItems((prev) => prev.map((i) => i._id === item._id ? { ...i, read: true } : i));
            setInboxCount((c) => Math.max(0, c - (item.read ? 0 : 1)));
          });
          if (item.refItem && item.type !== 'birthday_wish') navigate('/');
        },
      };
    });
  }

  function notifDropdownItems(): DropdownItem[] {
    return notifItems.map((item) => {
      const name = item.actor?.displayName || 'Former Employee';
      const textMap: Record<string, string> = {
        like: `${name} liked your post`,
        leave_approved: 'Your leave request was approved',
        leave_rejected: 'Your leave request was rejected',
        timesheet_approved: 'Your timesheet was approved',
        claim_approved: 'Your claim was approved',
        claim_denied: 'Your claim was denied',
      };
      const navMap: Record<string, string> = {
        like: '/',
        leave_approved: '/attendance',
        leave_rejected: '/attendance',
        claim_approved: '/my-requests',
        claim_denied: '/my-requests',
      };
      return {
        _id: item._id,
        person: item.actor,
        text: textMap[item.type] || `${name} — ${item.type}`,
        read: item.read,
        createdAt: item.createdAt,
        onClick: () => {
          markNotificationRead(item._id).then(() => {
            setNotifItems((prev) => prev.map((n) => n._id === item._id ? { ...n, read: true } : n));
            setNotifCount((c) => Math.max(0, c - (item.read ? 0 : 1)));
          });
          const target = navMap[item.type];
          if (target) navigate(target);
        },
      };
    });
  }

  async function handleMarkAllInboxRead() {
    await markAllInboxRead();
    setInboxItems((prev) => prev.map((i) => ({ ...i, read: true })));
    setInboxCount(0);
  }

  async function handleMarkAllNotifsRead() {
    await markAllNotificationsRead();
    setNotifItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setNotifCount(0);
  }
```

In the JSX, add the icons between the sidebar and routes. Insert a top bar inside `<main>`, before `<Routes>`:
```tsx
        <div className="shell-topbar">
          <div className="shell-topbar-right">
            <div className="shell-notif-wrapper">
              <button className="shell-notif-btn" onClick={openInbox} aria-label="Inbox">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                {inboxCount > 0 && <span className="shell-notif-badge">{inboxCount > 99 ? '99+' : inboxCount}</span>}
              </button>
              {showInbox && (
                <NotificationDropdown
                  title="Inbox"
                  icon={null}
                  badge={inboxCount}
                  items={inboxDropdownItems()}
                  onMarkAllRead={handleMarkAllInboxRead}
                  onClose={() => setShowInbox(false)}
                />
              )}
            </div>
            <div className="shell-notif-wrapper">
              <button className="shell-notif-btn" onClick={openNotifs} aria-label="Notifications">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {notifCount > 0 && <span className="shell-notif-badge">{notifCount > 99 ? '99+' : notifCount}</span>}
              </button>
              {showNotifs && (
                <NotificationDropdown
                  title="Notifications"
                  icon={null}
                  badge={notifCount}
                  items={notifDropdownItems()}
                  onMarkAllRead={handleMarkAllNotifsRead}
                  onClose={() => setShowNotifs(false)}
                />
              )}
            </div>
          </div>
        </div>
```

- [ ] **Step 5: Update HomePage — wish modal + My Posts tab**

In `web/src/dashboard/HomePage.tsx`, add import:
```tsx
import { sendWish } from './inboxApi';
import { getMyFeed } from './feedApi';
```

Replace the `handleWish` function:
```tsx
  const [wishTarget, setWishTarget] = useState<PeopleEntry | null>(null);
  const [wishBody, setWishBody] = useState('Happy Birthday!');
  const [wishBusy, setWishBusy] = useState(false);

  function handleWish(emp: PeopleEntry) {
    if (wishSent.has(emp._id)) return;
    setWishTarget(emp);
    setWishBody('Happy Birthday!');
  }

  async function submitWish() {
    if (!wishTarget || wishBusy) return;
    setWishBusy(true);
    try {
      await sendWish(wishTarget._id, wishBody);
      setWishSent((prev) => new Set(prev).add(wishTarget._id));
      setWishTarget(null);
    } finally {
      setWishBusy(false);
    }
  }
```

Add wish modal JSX before the closing `</div>` of `hp-content`:
```tsx
      {wishTarget && (
        <div className="hp-modal-overlay" onClick={() => setWishTarget(null)}>
          <div className="hp-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Send Birthday Wish to {wishTarget.name}</h3>
            <textarea value={wishBody} onChange={(e) => setWishBody(e.target.value)} />
            <div className="hp-modal-actions">
              <button onClick={() => setWishTarget(null)}>Cancel</button>
              <button onClick={submitWish} disabled={wishBusy || !wishBody.trim()}>
                {wishBusy ? 'Sending...' : 'Send Wish'}
              </button>
            </div>
          </div>
        </div>
      )}
```

In the `RightFeed` component, update the feed tabs to include "My Posts":
```tsx
  type FeedTab = 'Organization' | 'Product Design' | 'My Posts';
```

And update the tab change handler to load my posts:
```tsx
  async function handleTabChange(tab: FeedTab) {
    setFeedTab(tab);
    if (tab === 'My Posts') {
      setFeedLoading(true);
      try {
        const res = await getMyFeed();
        setFeedItems(res.items);
        setFeedCursor(res.cursor);
      } finally {
        setFeedLoading(false);
      }
    } else {
      setFeedLoading(true);
      try {
        const res = await getFeed();
        setFeedItems(res.items);
        setFeedCursor(res.cursor);
      } finally {
        setFeedLoading(false);
      }
    }
  }
```

Update the feed tab buttons to use `handleTabChange`:
```tsx
        {(['Organization', 'Product Design', 'My Posts'] as FeedTab[]).map((t) => (
          <button key={t} className={`hp-feed-tab ${feedTab === t ? 'active' : ''}`} onClick={() => handleTabChange(t)}>{t}</button>
        ))}
```

Update the `loadMore` function to respect the active tab:
```tsx
  async function loadMore() {
    if (!feedCursor || feedLoading) return;
    setFeedLoading(true);
    try {
      const res = feedTab === 'My Posts' ? await getMyFeed(feedCursor) : await getFeed(feedCursor);
      setFeedItems((prev) => [...prev, ...res.items]);
      setFeedCursor(res.cursor);
    } finally {
      setFeedLoading(false);
    }
  }
```

- [ ] **Step 6: Add notification dropdown CSS**

Append to `web/src/dashboard/HomePage.css`:

```css
/* ─── Notification Dropdown ────────────────────────────────────────────── */

.shell-topbar { display: flex; justify-content: flex-end; padding: 8px 16px; border-bottom: 1px solid var(--hp-border, #e5e7eb); }
.shell-topbar-right { display: flex; gap: 8px; align-items: center; }
.shell-notif-wrapper { position: relative; }
.shell-notif-btn { position: relative; background: none; border: 1px solid var(--hp-border, #e5e7eb); border-radius: 8px; padding: 6px 8px; cursor: pointer; color: inherit; }
.shell-notif-btn:hover { background: var(--hp-card-bg, #f3f4f6); }
.shell-notif-badge {
  position: absolute; top: -6px; right: -6px;
  background: #ef4444; color: #fff; font-size: 10px; font-weight: 700;
  min-width: 16px; height: 16px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; padding: 0 4px;
}

.nd-container { position: absolute; top: 100%; right: 0; z-index: 1000; margin-top: 4px; }
.nd-dropdown {
  width: 360px; max-height: 480px; background: var(--hp-card-bg, #fff);
  border: 1px solid var(--hp-border, #e5e7eb); border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,.12); overflow: hidden;
  display: flex; flex-direction: column;
}
.nd-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--hp-border, #e5e7eb); }
.nd-title { font-weight: 600; font-size: 14px; }
.nd-mark-all { background: none; border: none; color: #4f6ef7; cursor: pointer; font-size: 12px; }
.nd-list { overflow-y: auto; max-height: 420px; }
.nd-empty { padding: 32px 16px; text-align: center; color: var(--hp-text-muted, #888); font-size: 13px; }

.nd-item {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 16px;
  cursor: pointer; transition: background .1s;
}
.nd-item:hover { background: var(--hp-card-bg, #f9fafb); }
.nd-item--unread { background: #f0f4ff; }
.nd-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; font-weight: 600; flex-shrink: 0; }
.nd-item-body { flex: 1; min-width: 0; }
.nd-item-text { font-size: 13px; line-height: 1.4; display: block; overflow: hidden; text-overflow: ellipsis; }
.nd-item-time { font-size: 11px; color: var(--hp-text-muted, #888); }
.nd-unread-dot { width: 8px; height: 8px; border-radius: 50%; background: #4f6ef7; flex-shrink: 0; margin-top: 6px; }
```

- [ ] **Step 7: Verify build**

Run: `cd web && npx tsc --noEmit && npx vite build`
Expected: Zero errors, build succeeds

- [ ] **Step 8: Commit**

```bash
git add web/src/dashboard/inboxApi.ts web/src/dashboard/NotificationDropdown.tsx web/src/dashboard/feedApi.ts web/src/dashboard/HomePage.tsx web/src/dashboard/HomePage.css web/src/AppShell.tsx
git commit -m "feat(inbox): add frontend inbox/notification dropdowns, wish modal, My Posts tab"
```

---

### Task 5: End-to-End Verification

**Files:**
- Potentially modify any file from Tasks 1-4 if issues found

**Interfaces:**
- Consumes: Everything from Tasks 1-4
- Produces: Verified, working feature

- [ ] **Step 1: Run all backend tests**

Run: `cd auth-api && node --test`
Expected: All feed + inbox + notification tests pass (pre-existing failures in leave/attendance unrelated)

- [ ] **Step 2: Run frontend build**

Run: `cd web && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Manual smoke test**

Start servers and test in browser:
1. Log in → envelope + bell icons visible in top bar
2. Click envelope → "No inbox yet" dropdown
3. On home page birthdays section, click "Wish" → modal opens with "Happy Birthday!" pre-filled → send → button becomes "Wished"
4. Like someone else's post → they see notification in bell dropdown
5. Comment on someone's post → they see inbox message
6. Send praise → target sees inbox message
7. Click "My Posts" tab → shows only your own posts
8. Click "Mark all read" → all dots disappear, badge goes to 0

- [ ] **Step 4: Fix any issues found**

- [ ] **Step 5: Commit fixes if any**

```bash
git add -A
git commit -m "fix(inbox): address smoke test issues"
```
