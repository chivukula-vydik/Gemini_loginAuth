# Social Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a company-wide social feed (Post / Poll / Praise / Announcements) with likes, comments, poll voting (including anonymous), and admin moderation — all integrated into the existing home page.

**Architecture:** Single `/feed` Express router backed by two Mongoose models (`FeedItem` and `PollVote`). Frontend wires into the existing `HomePage.tsx` right column, replacing static UI shells with live components that call the feed API via the `authed()` fetch helper.

**Tech Stack:** Node.js/Express (ESM), Mongoose/MongoDB, React/TypeScript/Vite, `node:test` + supertest + mongodb-memory-server

## Global Constraints

- Node ESM modules (`import`/`export`), no CommonJS
- Tests use `node --test` (NOT vitest/jest)
- Auth via `requireAuth` middleware, role checks via `requireRole`
- Frontend fetches use `authed()` from `web/src/fetchHelper.ts`
- Poll anonymity: SHA-256 salted hashes, no userId in PollVote for anonymous votes
- Vote counts always computed from PollVote aggregation, never denormalized

---

### Task 1: FeedItem and PollVote Mongoose Models

**Files:**
- Create: `auth-api/src/models/FeedItem.js`
- Create: `auth-api/src/models/PollVote.js`
- Test: `auth-api/test/feed.test.js`

**Interfaces:**
- Produces: `FeedItem` model (Mongoose), `PollVote` model (Mongoose), `FEED_TYPES` constant, `PRAISE_CATEGORIES` constant

- [ ] **Step 1: Write the failing test for FeedItem creation**

In `auth-api/test/feed.test.js`:

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

const { FeedItem, FEED_TYPES, PRAISE_CATEGORIES } = await import('../src/models/FeedItem.js');
const { PollVote } = await import('../src/models/PollVote.js');

test('FeedItem: creates a post with defaults', async () => {
  const userId = new mongoose.Types.ObjectId();
  const item = await FeedItem.create({ type: 'post', author: userId, body: 'Hello world' });
  assert.equal(item.type, 'post');
  assert.equal(item.status, 'active');
  assert.ok(item.createdAt);
  assert.deepEqual(item.likes, []);
  assert.deepEqual(item.comments, []);
});

test('FeedItem: FEED_TYPES constant', () => {
  assert.deepEqual(FEED_TYPES, ['post', 'poll', 'praise', 'announcement']);
});

test('FeedItem: PRAISE_CATEGORIES constant', () => {
  assert.deepEqual(PRAISE_CATEGORIES, ['teamwork', 'innovation', 'leadership', 'ownership', 'excellence']);
});

test('FeedItem: creates a poll with salt and options', async () => {
  const userId = new mongoose.Types.ObjectId();
  const item = await FeedItem.create({
    type: 'poll',
    author: userId,
    body: 'Favorite color?',
    pollOptions: [{ text: 'Red' }, { text: 'Blue' }],
    pollMultiChoice: false,
    pollAnonymous: true,
    pollSalt: 'random-salt-value',
  });
  assert.equal(item.pollOptions.length, 2);
  assert.equal(item.pollAnonymous, true);
  assert.equal(item.pollSalt, 'random-salt-value');
  assert.deepEqual(item.pollVoterHashes, []);
});

test('FeedItem: creates praise with target and category', async () => {
  const author = new mongoose.Types.ObjectId();
  const target = new mongoose.Types.ObjectId();
  const item = await FeedItem.create({
    type: 'praise',
    author,
    body: 'Great work!',
    praiseTarget: target,
    praiseCategory: 'teamwork',
  });
  assert.equal(String(item.praiseTarget), String(target));
  assert.equal(item.praiseCategory, 'teamwork');
});

test('FeedItem: creates announcement with pinnedUntil', async () => {
  const userId = new mongoose.Types.ObjectId();
  const pin = new Date(Date.now() + 30 * 86400000);
  const item = await FeedItem.create({
    type: 'announcement',
    author: userId,
    body: 'Company picnic Friday',
    pinnedUntil: pin,
  });
  assert.ok(item.pinnedUntil);
});

test('PollVote: creates visible vote with userId', async () => {
  const pollId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const vote = await PollVote.create({ pollId, userId, optionIndices: [0] });
  assert.equal(String(vote.pollId), String(pollId));
  assert.equal(String(vote.userId), String(userId));
  assert.deepEqual(vote.optionIndices, [0]);
});

test('PollVote: creates anonymous vote with null userId', async () => {
  const pollId = new mongoose.Types.ObjectId();
  const vote = await PollVote.create({ pollId, userId: null, optionIndices: [1] });
  assert.equal(vote.userId, null);
});

test('PollVote: unique index prevents duplicate visible vote', async () => {
  const pollId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  await PollVote.create({ pollId, userId, optionIndices: [0] });
  await assert.rejects(
    () => PollVote.create({ pollId, userId, optionIndices: [1] }),
    (err) => err.code === 11000,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd auth-api && node --test test/feed.test.js`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement FeedItem model**

Create `auth-api/src/models/FeedItem.js`:

```js
import mongoose from 'mongoose';

export const FEED_TYPES = ['post', 'poll', 'praise', 'announcement'];
export const PRAISE_CATEGORIES = ['teamwork', 'innovation', 'leadership', 'ownership', 'excellence'];

const commentSchema = new mongoose.Schema({
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body:      { type: String, required: true },
  status:    { type: String, enum: ['active', 'hidden'], default: 'active' },
}, { timestamps: { createdAt: true, updatedAt: false } });

const feedItemSchema = new mongoose.Schema({
  type:           { type: String, enum: FEED_TYPES, required: true },
  author:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body:           { type: String, required: true },
  status:         { type: String, enum: ['active', 'hidden'], default: 'active' },

  pollOptions:     [{ text: { type: String, required: true } }],
  pollMultiChoice: { type: Boolean, default: false },
  pollAnonymous:   { type: Boolean, default: false },
  pollVoterHashes: [String],
  pollSalt:        { type: String, default: null, select: false },

  praiseTarget:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  praiseCategory: { type: String, enum: [...PRAISE_CATEGORIES, null], default: null },

  pinnedUntil:    { type: Date, default: null },

  likes:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [commentSchema],
}, { timestamps: true });

feedItemSchema.index({ status: 1, createdAt: -1 });
feedItemSchema.index({ type: 1, pinnedUntil: 1 });

export const FeedItem = mongoose.model('FeedItem', feedItemSchema);
```

- [ ] **Step 4: Implement PollVote model**

Create `auth-api/src/models/PollVote.js`:

```js
import mongoose from 'mongoose';

const pollVoteSchema = new mongoose.Schema({
  pollId:        { type: mongoose.Schema.Types.ObjectId, ref: 'FeedItem', required: true },
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  optionIndices: [{ type: Number, required: true }],
}, { timestamps: { createdAt: true, updatedAt: false } });

pollVoteSchema.index(
  { pollId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $ne: null } } },
);

export const PollVote = mongoose.model('PollVote', pollVoteSchema);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd auth-api && node --test test/feed.test.js`
Expected: All 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/models/FeedItem.js auth-api/src/models/PollVote.js auth-api/test/feed.test.js
git commit -m "feat(feed): add FeedItem and PollVote models with tests"
```

---

### Task 2: Feed Router — CRUD (create, list, delete)

**Files:**
- Create: `auth-api/src/routes/feed.js`
- Modify: `auth-api/src/app.js:1-125` (add import and mount)
- Test: `auth-api/test/feed-routes.test.js`

**Interfaces:**
- Consumes: `FeedItem` model, `PollVote` model, `FEED_TYPES`, `PRAISE_CATEGORIES`, `requireAuth`, `requireRole`, `asyncHandler`
- Produces: `createFeedRouter()` function; endpoints `GET /feed`, `GET /feed/:id`, `POST /feed`, `DELETE /feed/:id`

- [ ] **Step 1: Write failing tests for feed CRUD**

Create `auth-api/test/feed-routes.test.js`:

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
const { PollVote } = await import('../src/models/PollVote.js');
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

describe('POST /feed', () => {
  test('creates a post', async () => {
    const user = await User.create({ email: 'fp1@x.com', displayName: 'FP1', roles: ['employee'] });
    const res = await request(app)
      .post('/feed')
      .set('Authorization', bearer(user))
      .send({ type: 'post', body: 'Hello feed!' });
    assert.equal(res.status, 201);
    assert.equal(res.body.type, 'post');
    assert.equal(res.body.body, 'Hello feed!');
  });

  test('creates a poll', async () => {
    const user = await User.create({ email: 'fp2@x.com', displayName: 'FP2', roles: ['employee'] });
    const res = await request(app)
      .post('/feed')
      .set('Authorization', bearer(user))
      .send({
        type: 'poll',
        body: 'Best language?',
        pollOptions: [{ text: 'JS' }, { text: 'Python' }],
        pollMultiChoice: false,
        pollAnonymous: true,
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.type, 'poll');
    assert.equal(res.body.pollOptions.length, 2);
    assert.equal(res.body.pollSalt, undefined);
  });

  test('creates praise, rejects self-praise', async () => {
    const user = await User.create({ email: 'fp3@x.com', displayName: 'FP3', roles: ['employee'] });
    const target = await User.create({ email: 'fp4@x.com', displayName: 'FP4', roles: ['employee'] });
    const ok = await request(app)
      .post('/feed')
      .set('Authorization', bearer(user))
      .send({ type: 'praise', body: 'Great job!', praiseTarget: target._id, praiseCategory: 'teamwork' });
    assert.equal(ok.status, 201);

    const bad = await request(app)
      .post('/feed')
      .set('Authorization', bearer(user))
      .send({ type: 'praise', body: 'I am great', praiseTarget: user._id });
    assert.equal(bad.status, 400);
  });

  test('announcement requires admin/hr', async () => {
    const emp = await User.create({ email: 'fp5@x.com', displayName: 'FP5', roles: ['employee'] });
    const admin = await User.create({ email: 'fp6@x.com', displayName: 'FP6', roles: ['admin'] });

    const bad = await request(app)
      .post('/feed')
      .set('Authorization', bearer(emp))
      .send({ type: 'announcement', body: 'News' });
    assert.equal(bad.status, 403);

    const ok = await request(app)
      .post('/feed')
      .set('Authorization', bearer(admin))
      .send({ type: 'announcement', body: 'News' });
    assert.equal(ok.status, 201);
    assert.ok(ok.body.pinnedUntil);
  });

  test('max 3 active announcements', async () => {
    const admin = await User.create({ email: 'fp7@x.com', displayName: 'FP7', roles: ['admin'] });
    for (let i = 0; i < 3; i++) {
      await FeedItem.create({
        type: 'announcement', author: admin._id, body: `Ann ${i}`,
        pinnedUntil: new Date(Date.now() + 86400000),
      });
    }
    const res = await request(app)
      .post('/feed')
      .set('Authorization', bearer(admin))
      .send({ type: 'announcement', body: '4th' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /max 3/i);
  });
});

describe('GET /feed', () => {
  test('returns items sorted by createdAt desc, pinned first', async () => {
    const user = await User.create({ email: 'fg1@x.com', displayName: 'FG1', roles: ['employee'] });
    await FeedItem.deleteMany({});
    const post = await FeedItem.create({ type: 'post', author: user._id, body: 'Old post' });
    const ann = await FeedItem.create({
      type: 'announcement', author: user._id, body: 'Pinned',
      pinnedUntil: new Date(Date.now() + 86400000),
    });
    const res = await request(app)
      .get('/feed')
      .set('Authorization', bearer(user));
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.items));
    assert.equal(res.body.items[0].type, 'announcement');
  });

  test('hidden items excluded', async () => {
    const user = await User.create({ email: 'fg2@x.com', displayName: 'FG2', roles: ['employee'] });
    await FeedItem.deleteMany({});
    await FeedItem.create({ type: 'post', author: user._id, body: 'Visible' });
    await FeedItem.create({ type: 'post', author: user._id, body: 'Hidden', status: 'hidden' });
    const res = await request(app)
      .get('/feed')
      .set('Authorization', bearer(user));
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].body, 'Visible');
  });
});

describe('DELETE /feed/:id', () => {
  test('author can delete own item', async () => {
    const user = await User.create({ email: 'fd1@x.com', displayName: 'FD1', roles: ['employee'] });
    const item = await FeedItem.create({ type: 'post', author: user._id, body: 'Delete me' });
    const res = await request(app)
      .delete(`/feed/${item._id}`)
      .set('Authorization', bearer(user));
    assert.equal(res.status, 200);
    const check = await FeedItem.findById(item._id);
    assert.equal(check.status, 'hidden');
  });

  test('non-author non-admin cannot delete', async () => {
    const owner = await User.create({ email: 'fd2@x.com', displayName: 'FD2', roles: ['employee'] });
    const other = await User.create({ email: 'fd3@x.com', displayName: 'FD3', roles: ['employee'] });
    const item = await FeedItem.create({ type: 'post', author: owner._id, body: 'Mine' });
    const res = await request(app)
      .delete(`/feed/${item._id}`)
      .set('Authorization', bearer(other));
    assert.equal(res.status, 403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd auth-api && node --test test/feed-routes.test.js`
Expected: FAIL — router not found / 404s

- [ ] **Step 3: Implement the feed router**

Create `auth-api/src/routes/feed.js`:

```js
import express from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { FeedItem, FEED_TYPES, PRAISE_CATEGORIES } from '../models/FeedItem.js';
import { PollVote } from '../models/PollVote.js';

async function tallyVotes(pollId) {
  const votes = await PollVote.find({ pollId });
  const counts = {};
  for (const v of votes) {
    for (const idx of v.optionIndices) {
      counts[idx] = (counts[idx] || 0) + 1;
    }
  }
  return counts;
}

function sanitiseItem(item, userId) {
  const obj = item.toObject ? item.toObject() : { ...item };
  delete obj.pollSalt;
  delete obj.pollVoterHashes;
  obj.likeCount = (obj.likes || []).length;
  obj.liked = (obj.likes || []).some((id) => String(id) === String(userId));
  obj.commentCount = (obj.comments || []).filter((c) => c.status === 'active').length;
  obj.comments = (obj.comments || []).filter((c) => c.status === 'active');
  return obj;
}

export function createFeedRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // GET /feed?cursor=<lastId>&limit=20
  router.get('/', asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const now = new Date();

    const pinned = await FeedItem.find({
      type: 'announcement', status: 'active', pinnedUntil: { $gt: now },
    })
      .populate('author', 'displayName email')
      .sort({ createdAt: -1 });

    const pinnedIds = pinned.map((p) => p._id);
    const filter = { status: 'active', _id: { $nin: pinnedIds } };
    if (req.query.cursor) filter._id = { ...filter._id, $lt: req.query.cursor };

    const items = await FeedItem.find(filter)
      .populate('author', 'displayName email')
      .populate('praiseTarget', 'displayName email')
      .populate('comments.author', 'displayName email')
      .sort({ createdAt: -1 })
      .limit(limit);

    const all = [...pinned, ...items];

    const pollIds = all.filter((i) => i.type === 'poll').map((i) => i._id);
    const allVotes = pollIds.length > 0
      ? await PollVote.find({ pollId: { $in: pollIds } })
      : [];

    const tallyMap = {};
    for (const v of allVotes) {
      const key = String(v.pollId);
      if (!tallyMap[key]) tallyMap[key] = {};
      for (const idx of v.optionIndices) {
        tallyMap[key][idx] = (tallyMap[key][idx] || 0) + 1;
      }
    }

    const userId = req.user.sub;
    const result = all.map((item) => {
      const obj = sanitiseItem(item, userId);
      if (item.type === 'poll') {
        obj.voteTally = tallyMap[String(item._id)] || {};
        const myVote = allVotes.find(
          (v) => String(v.pollId) === String(item._id) && String(v.userId) === String(userId),
        );
        obj.myVote = myVote ? myVote.optionIndices : null;
      }
      return obj;
    });

    const cursor = items.length === limit ? String(items[items.length - 1]._id) : null;
    res.json({ items: result, cursor });
  }));

  // GET /feed/:id
  router.get('/:id', asyncHandler(async (req, res) => {
    const item = await FeedItem.findOne({ _id: req.params.id, status: 'active' })
      .populate('author', 'displayName email')
      .populate('praiseTarget', 'displayName email')
      .populate('comments.author', 'displayName email');
    if (!item) return res.status(404).json({ error: 'not found' });

    const obj = sanitiseItem(item, req.user.sub);
    if (item.type === 'poll') {
      obj.voteTally = await tallyVotes(item._id);
      const myVote = await PollVote.findOne({ pollId: item._id, userId: req.user.sub });
      obj.myVote = myVote ? myVote.optionIndices : null;
    }
    res.json(obj);
  }));

  // POST /feed
  router.post('/', asyncHandler(async (req, res) => {
    const { type, body, pollOptions, pollMultiChoice, pollAnonymous, praiseTarget, praiseCategory } = req.body;
    if (!FEED_TYPES.includes(type)) return res.status(400).json({ error: 'invalid type' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });

    const roles = req.user.roles || [req.user.role || 'employee'];
    const doc = { type, author: req.user.sub, body: body.trim() };

    if (type === 'announcement') {
      if (!roles.includes('admin') && !roles.includes('hr')) {
        return res.status(403).json({ error: 'only admin/hr can create announcements' });
      }
      const activeCount = await FeedItem.countDocuments({
        type: 'announcement', status: 'active', pinnedUntil: { $gt: new Date() },
      });
      if (activeCount >= 3) return res.status(400).json({ error: 'max 3 active announcements' });
      doc.pinnedUntil = new Date(Date.now() + 30 * 86400000);
    }

    if (type === 'poll') {
      if (!Array.isArray(pollOptions) || pollOptions.length < 2) {
        return res.status(400).json({ error: 'polls need at least 2 options' });
      }
      doc.pollOptions = pollOptions.map((o) => ({ text: String(o.text || o).trim() }));
      doc.pollMultiChoice = !!pollMultiChoice;
      doc.pollAnonymous = !!pollAnonymous;
      doc.pollSalt = crypto.randomBytes(16).toString('hex');
    }

    if (type === 'praise') {
      if (!praiseTarget) return res.status(400).json({ error: 'praiseTarget is required' });
      if (String(praiseTarget) === String(req.user.sub)) {
        return res.status(400).json({ error: 'cannot praise yourself' });
      }
      doc.praiseTarget = praiseTarget;
      if (praiseCategory && PRAISE_CATEGORIES.includes(praiseCategory)) {
        doc.praiseCategory = praiseCategory;
      }
    }

    const item = await FeedItem.create(doc);
    const populated = await FeedItem.findById(item._id)
      .populate('author', 'displayName email')
      .populate('praiseTarget', 'displayName email');
    const result = sanitiseItem(populated, req.user.sub);
    if (type === 'poll') {
      result.voteTally = {};
      result.myVote = null;
    }
    res.status(201).json(result);
  }));

  // DELETE /feed/:id
  router.delete('/:id', asyncHandler(async (req, res) => {
    const item = await FeedItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    const roles = req.user.roles || [req.user.role || 'employee'];
    const isOwner = String(item.author) === String(req.user.sub);
    const isAdmin = roles.includes('admin') || roles.includes('hr');
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'forbidden' });
    item.status = 'hidden';
    await item.save();
    res.json({ ok: true });
  }));

  return router;
}
```

- [ ] **Step 4: Mount the router in app.js**

Add import at top of `auth-api/src/app.js`:
```js
import { createFeedRouter } from './routes/feed.js';
```

Add mount line after the declarations route:
```js
app.use('/feed', createFeedRouter());
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd auth-api && node --test test/feed-routes.test.js`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/routes/feed.js auth-api/src/app.js auth-api/test/feed-routes.test.js
git commit -m "feat(feed): add feed router with CRUD endpoints and tests"
```

---

### Task 3: Interactions — Like, Comment, Vote, Moderation

**Files:**
- Modify: `auth-api/src/routes/feed.js` (add endpoints)
- Modify: `auth-api/test/feed-routes.test.js` (add tests)

**Interfaces:**
- Consumes: `FeedItem`, `PollVote`, `createFeedRouter()` from Task 2
- Produces: endpoints `POST /feed/:id/like`, `POST /feed/:id/comment`, `DELETE /feed/:id/comment/:commentId`, `POST /feed/:id/vote`, `PATCH /feed/:id/moderate`

- [ ] **Step 1: Add tests for interactions**

Append to `auth-api/test/feed-routes.test.js`:

```js
describe('POST /feed/:id/like', () => {
  test('toggles like on/off', async () => {
    const user = await User.create({ email: 'fl1@x.com', displayName: 'FL1', roles: ['employee'] });
    const item = await FeedItem.create({ type: 'post', author: user._id, body: 'Like me' });

    const r1 = await request(app)
      .post(`/feed/${item._id}/like`)
      .set('Authorization', bearer(user));
    assert.equal(r1.status, 200);
    assert.equal(r1.body.liked, true);
    assert.equal(r1.body.likeCount, 1);

    const r2 = await request(app)
      .post(`/feed/${item._id}/like`)
      .set('Authorization', bearer(user));
    assert.equal(r2.body.liked, false);
    assert.equal(r2.body.likeCount, 0);
  });

  test('cannot like announcement', async () => {
    const admin = await User.create({ email: 'fl2@x.com', displayName: 'FL2', roles: ['admin'] });
    const ann = await FeedItem.create({
      type: 'announcement', author: admin._id, body: 'No likes',
      pinnedUntil: new Date(Date.now() + 86400000),
    });
    const res = await request(app)
      .post(`/feed/${ann._id}/like`)
      .set('Authorization', bearer(admin));
    assert.equal(res.status, 400);
  });
});

describe('POST /feed/:id/comment', () => {
  test('adds a comment', async () => {
    const user = await User.create({ email: 'fc1@x.com', displayName: 'FC1', roles: ['employee'] });
    const item = await FeedItem.create({ type: 'post', author: user._id, body: 'Comment me' });
    const res = await request(app)
      .post(`/feed/${item._id}/comment`)
      .set('Authorization', bearer(user))
      .send({ body: 'Nice post!' });
    assert.equal(res.status, 201);
    assert.equal(res.body.comments.length, 1);
    assert.equal(res.body.comments[0].body, 'Nice post!');
  });

  test('cannot comment on announcement', async () => {
    const admin = await User.create({ email: 'fc2@x.com', displayName: 'FC2', roles: ['admin'] });
    const ann = await FeedItem.create({
      type: 'announcement', author: admin._id, body: 'No comments',
      pinnedUntil: new Date(Date.now() + 86400000),
    });
    const res = await request(app)
      .post(`/feed/${ann._id}/comment`)
      .set('Authorization', bearer(admin))
      .send({ body: 'hello' });
    assert.equal(res.status, 400);
  });

  test('cannot comment on hidden item', async () => {
    const user = await User.create({ email: 'fc3@x.com', displayName: 'FC3', roles: ['employee'] });
    const item = await FeedItem.create({ type: 'post', author: user._id, body: 'Gone', status: 'hidden' });
    const res = await request(app)
      .post(`/feed/${item._id}/comment`)
      .set('Authorization', bearer(user))
      .send({ body: 'hello' });
    assert.equal(res.status, 404);
  });
});

describe('DELETE /feed/:id/comment/:commentId', () => {
  test('comment author can delete own comment', async () => {
    const user = await User.create({ email: 'fcd1@x.com', displayName: 'FCD1', roles: ['employee'] });
    const item = await FeedItem.create({ type: 'post', author: user._id, body: 'Item' });
    item.comments.push({ author: user._id, body: 'My comment' });
    await item.save();
    const commentId = item.comments[0]._id;

    const res = await request(app)
      .delete(`/feed/${item._id}/comment/${commentId}`)
      .set('Authorization', bearer(user));
    assert.equal(res.status, 200);
  });
});

describe('POST /feed/:id/vote', () => {
  test('visible poll: vote and re-vote', async () => {
    const user = await User.create({ email: 'fv1@x.com', displayName: 'FV1', roles: ['employee'] });
    const poll = await FeedItem.create({
      type: 'poll', author: user._id, body: 'Color?',
      pollOptions: [{ text: 'Red' }, { text: 'Blue' }],
      pollMultiChoice: false, pollAnonymous: false, pollSalt: 'salt1',
    });

    const r1 = await request(app)
      .post(`/feed/${poll._id}/vote`)
      .set('Authorization', bearer(user))
      .send({ optionIndices: [0] });
    assert.equal(r1.status, 200);
    assert.equal(r1.body.voteTally['0'], 1);

    const r2 = await request(app)
      .post(`/feed/${poll._id}/vote`)
      .set('Authorization', bearer(user))
      .send({ optionIndices: [1] });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.voteTally['1'], 1);
    assert.equal(r2.body.voteTally['0'], undefined);
  });

  test('anonymous poll: vote once, reject re-vote with 409', async () => {
    const user = await User.create({ email: 'fv2@x.com', displayName: 'FV2', roles: ['employee'] });
    const poll = await FeedItem.create({
      type: 'poll', author: user._id, body: 'Anon?',
      pollOptions: [{ text: 'Yes' }, { text: 'No' }],
      pollMultiChoice: false, pollAnonymous: true, pollSalt: 'anon-salt',
    });

    const r1 = await request(app)
      .post(`/feed/${poll._id}/vote`)
      .set('Authorization', bearer(user))
      .send({ optionIndices: [0] });
    assert.equal(r1.status, 200);

    const r2 = await request(app)
      .post(`/feed/${poll._id}/vote`)
      .set('Authorization', bearer(user))
      .send({ optionIndices: [1] });
    assert.equal(r2.status, 409);
  });

  test('single-choice rejects multiple options', async () => {
    const user = await User.create({ email: 'fv3@x.com', displayName: 'FV3', roles: ['employee'] });
    const poll = await FeedItem.create({
      type: 'poll', author: user._id, body: 'Pick one',
      pollOptions: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
      pollMultiChoice: false, pollAnonymous: false, pollSalt: 'salt3',
    });
    const res = await request(app)
      .post(`/feed/${poll._id}/vote`)
      .set('Authorization', bearer(user))
      .send({ optionIndices: [0, 1] });
    assert.equal(res.status, 400);
  });

  test('anonymous vote has no userId in PollVote', async () => {
    const user = await User.create({ email: 'fv4@x.com', displayName: 'FV4', roles: ['employee'] });
    const poll = await FeedItem.create({
      type: 'poll', author: user._id, body: 'Secret',
      pollOptions: [{ text: 'X' }, { text: 'Y' }],
      pollMultiChoice: false, pollAnonymous: true, pollSalt: 'secret-salt',
    });
    await request(app)
      .post(`/feed/${poll._id}/vote`)
      .set('Authorization', bearer(user))
      .send({ optionIndices: [0] });
    const vote = await PollVote.findOne({ pollId: poll._id });
    assert.equal(vote.userId, null);
  });
});

describe('PATCH /feed/:id/moderate', () => {
  test('admin can hide an item', async () => {
    const admin = await User.create({ email: 'fm1@x.com', displayName: 'FM1', roles: ['admin'] });
    const emp = await User.create({ email: 'fm2@x.com', displayName: 'FM2', roles: ['employee'] });
    const item = await FeedItem.create({ type: 'post', author: emp._id, body: 'Bad post' });

    const res = await request(app)
      .patch(`/feed/${item._id}/moderate`)
      .set('Authorization', bearer(admin))
      .send({ status: 'hidden' });
    assert.equal(res.status, 200);
    const check = await FeedItem.findById(item._id);
    assert.equal(check.status, 'hidden');
  });

  test('non-admin gets 403', async () => {
    const emp = await User.create({ email: 'fm3@x.com', displayName: 'FM3', roles: ['employee'] });
    const item = await FeedItem.create({ type: 'post', author: emp._id, body: 'Fine post' });

    const res = await request(app)
      .patch(`/feed/${item._id}/moderate`)
      .set('Authorization', bearer(emp))
      .send({ status: 'hidden' });
    assert.equal(res.status, 403);
  });

  test('admin can hide a specific comment', async () => {
    const admin = await User.create({ email: 'fm4@x.com', displayName: 'FM4', roles: ['admin'] });
    const item = await FeedItem.create({ type: 'post', author: admin._id, body: 'Item' });
    item.comments.push({ author: admin._id, body: 'Bad comment' });
    await item.save();
    const commentId = item.comments[0]._id;

    const res = await request(app)
      .patch(`/feed/${item._id}/moderate`)
      .set('Authorization', bearer(admin))
      .send({ status: 'hidden', commentId });
    assert.equal(res.status, 200);
    const check = await FeedItem.findById(item._id);
    assert.equal(check.comments[0].status, 'hidden');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd auth-api && node --test test/feed-routes.test.js`
Expected: FAIL — endpoints return 404

- [ ] **Step 3: Add interaction endpoints to feed router**

Append the following endpoints inside `createFeedRouter()` in `auth-api/src/routes/feed.js`, before the `return router;` line:

```js
  // POST /feed/:id/like
  router.post('/:id/like', asyncHandler(async (req, res) => {
    const item = await FeedItem.findOne({ _id: req.params.id, status: 'active' });
    if (!item) return res.status(404).json({ error: 'not found' });
    if (item.type === 'announcement') return res.status(400).json({ error: 'cannot like announcements' });

    const uid = req.user.sub;
    const already = item.likes.some((id) => String(id) === String(uid));
    if (already) {
      await FeedItem.updateOne({ _id: item._id }, { $pull: { likes: uid } });
    } else {
      await FeedItem.updateOne({ _id: item._id }, { $addToSet: { likes: uid } });
    }
    const updated = await FeedItem.findById(item._id);
    res.json({ liked: !already, likeCount: updated.likes.length });
  }));

  // POST /feed/:id/comment
  router.post('/:id/comment', asyncHandler(async (req, res) => {
    const item = await FeedItem.findOne({ _id: req.params.id, status: 'active' });
    if (!item) return res.status(404).json({ error: 'not found' });
    if (item.type === 'announcement') return res.status(400).json({ error: 'cannot comment on announcements' });

    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });

    item.comments.push({ author: req.user.sub, body: body.trim() });
    await item.save();
    const populated = await FeedItem.findById(item._id)
      .populate('comments.author', 'displayName email');
    const obj = sanitiseItem(populated, req.user.sub);
    res.status(201).json(obj);
  }));

  // DELETE /feed/:id/comment/:commentId
  router.delete('/:id/comment/:commentId', asyncHandler(async (req, res) => {
    const item = await FeedItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    const comment = item.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'comment not found' });
    const roles = req.user.roles || [req.user.role || 'employee'];
    const isCommentAuthor = String(comment.author) === String(req.user.sub);
    const isAdmin = roles.includes('admin') || roles.includes('hr');
    if (!isCommentAuthor && !isAdmin) return res.status(403).json({ error: 'forbidden' });
    comment.status = 'hidden';
    await item.save();
    res.json({ ok: true });
  }));

  // POST /feed/:id/vote
  router.post('/:id/vote', asyncHandler(async (req, res) => {
    const item = await FeedItem.findOne({ _id: req.params.id, status: 'active', type: 'poll' })
      .select('+pollSalt');
    if (!item) return res.status(404).json({ error: 'poll not found' });

    const { optionIndices } = req.body;
    if (!Array.isArray(optionIndices) || optionIndices.length === 0) {
      return res.status(400).json({ error: 'optionIndices required' });
    }
    if (!item.pollMultiChoice && optionIndices.length > 1) {
      return res.status(400).json({ error: 'single-choice poll: pick one option' });
    }
    const maxIdx = item.pollOptions.length - 1;
    if (optionIndices.some((i) => i < 0 || i > maxIdx)) {
      return res.status(400).json({ error: 'invalid option index' });
    }

    if (item.pollAnonymous) {
      const hash = crypto.createHash('sha256')
        .update(item.pollSalt + ':' + req.user.sub)
        .digest('hex');
      if (item.pollVoterHashes.includes(hash)) {
        return res.status(409).json({ error: 'already voted' });
      }
      await PollVote.create({ pollId: item._id, userId: null, optionIndices });
      await FeedItem.updateOne({ _id: item._id }, { $push: { pollVoterHashes: hash } });
    } else {
      await PollVote.findOneAndUpdate(
        { pollId: item._id, userId: req.user.sub },
        { optionIndices },
        { upsert: true },
      );
    }

    const tally = await tallyVotes(item._id);
    res.json({ voteTally: tally, myVote: optionIndices });
  }));

  // PATCH /feed/:id/moderate
  router.patch('/:id/moderate', requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
    const { status, commentId } = req.body;
    if (!['hidden', 'active'].includes(status)) {
      return res.status(400).json({ error: 'status must be hidden or active' });
    }
    const item = await FeedItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });

    if (commentId) {
      const comment = item.comments.id(commentId);
      if (!comment) return res.status(404).json({ error: 'comment not found' });
      comment.status = status;
      await item.save();
    } else {
      item.status = status;
      await item.save();
    }
    res.json({ ok: true });
  }));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd auth-api && node --test test/feed-routes.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/feed.js auth-api/test/feed-routes.test.js
git commit -m "feat(feed): add like, comment, vote, and moderation endpoints"
```

---

### Task 4: Frontend — Feed API Layer and Types

**Files:**
- Create: `web/src/dashboard/feedApi.ts`

**Interfaces:**
- Consumes: `authed()` from `web/src/fetchHelper.ts`
- Produces: TypeScript types and fetch functions for the frontend components

- [ ] **Step 1: Create feed API module**

Create `web/src/dashboard/feedApi.ts`:

```ts
import { authed } from '../fetchHelper';

export type FeedItemType = 'post' | 'poll' | 'praise' | 'announcement';

export interface FeedAuthor {
  _id: string;
  displayName: string;
  email: string;
}

export interface FeedComment {
  _id: string;
  author: FeedAuthor;
  body: string;
  createdAt: string;
}

export interface PollOption {
  text: string;
  _id: string;
}

export interface FeedItem {
  _id: string;
  type: FeedItemType;
  author: FeedAuthor;
  body: string;
  status: string;
  createdAt: string;

  pollOptions?: PollOption[];
  pollMultiChoice?: boolean;
  pollAnonymous?: boolean;
  voteTally?: Record<string, number>;
  myVote?: number[] | null;

  praiseTarget?: FeedAuthor;
  praiseCategory?: string;

  pinnedUntil?: string;

  likes: string[];
  likeCount: number;
  liked: boolean;
  comments: FeedComment[];
  commentCount: number;
}

export interface FeedResponse {
  items: FeedItem[];
  cursor: string | null;
}

export async function getFeed(cursor?: string): Promise<FeedResponse> {
  const q = cursor ? `?cursor=${cursor}` : '';
  return authed(`/feed${q}`);
}

export async function createFeedItem(data: {
  type: FeedItemType;
  body: string;
  pollOptions?: { text: string }[];
  pollMultiChoice?: boolean;
  pollAnonymous?: boolean;
  praiseTarget?: string;
  praiseCategory?: string;
}): Promise<FeedItem> {
  return authed('/feed', 'POST', data);
}

export async function deleteFeedItem(id: string): Promise<void> {
  return authed(`/feed/${id}`, 'DELETE');
}

export async function toggleLike(id: string): Promise<{ liked: boolean; likeCount: number }> {
  return authed(`/feed/${id}/like`, 'POST');
}

export async function addComment(id: string, body: string): Promise<FeedItem> {
  return authed(`/feed/${id}/comment`, 'POST', { body });
}

export async function deleteComment(itemId: string, commentId: string): Promise<void> {
  return authed(`/feed/${itemId}/comment/${commentId}`, 'DELETE');
}

export async function votePoll(id: string, optionIndices: number[]): Promise<{ voteTally: Record<string, number>; myVote: number[] }> {
  return authed(`/feed/${id}/vote`, 'POST', { optionIndices });
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/dashboard/feedApi.ts
git commit -m "feat(feed): add frontend API layer and types"
```

---

### Task 5: Frontend — Feed Composer Component

**Files:**
- Create: `web/src/dashboard/FeedComposer.tsx`

**Interfaces:**
- Consumes: `createFeedItem()`, `FeedItem` type from `feedApi.ts`, `authed()` for user list, `useAuth()` from `authContext`
- Produces: `<FeedComposer onPost={(item: FeedItem) => void}>` component

- [ ] **Step 1: Create the FeedComposer component**

Create `web/src/dashboard/FeedComposer.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useAuth } from '../authContext';
import { authed } from '../fetchHelper';
import { createFeedItem, FeedItem } from './feedApi';

type PostTab = 'Post' | 'Poll' | 'Praise';
const PRAISE_CATEGORIES = ['teamwork', 'innovation', 'leadership', 'ownership', 'excellence'];

interface UserOption {
  _id: string;
  displayName: string;
  email: string;
}

export function FeedComposer({ onPost }: { onPost: (item: FeedItem) => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<PostTab>('Post');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Poll state
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMultiChoice, setPollMultiChoice] = useState(false);
  const [pollAnonymous, setPollAnonymous] = useState(false);

  // Praise state
  const [praiseTarget, setPraiseTarget] = useState('');
  const [praiseCategory, setPraiseCategory] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    authed('/users').then((data: UserOption[]) => {
      setUsers(Array.isArray(data) ? data.filter((u) => u._id !== (user as any)?._id) : []);
    }).catch(() => {});
  }, [user]);

  function reset() {
    setBody('');
    setPollOptions(['', '']);
    setPollMultiChoice(false);
    setPollAnonymous(false);
    setPraiseTarget('');
    setPraiseCategory('');
    setError('');
  }

  async function handleSubmit() {
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      let data: Parameters<typeof createFeedItem>[0] = { type: tab.toLowerCase() as any, body };
      if (tab === 'Poll') {
        const opts = pollOptions.filter((o) => o.trim());
        if (opts.length < 2) { setError('At least 2 options required'); setBusy(false); return; }
        data = { ...data, pollOptions: opts.map((text) => ({ text })), pollMultiChoice, pollAnonymous };
      }
      if (tab === 'Praise') {
        if (!praiseTarget) { setError('Select a person'); setBusy(false); return; }
        data = { ...data, praiseTarget, praiseCategory: praiseCategory || undefined };
      }
      const item = await createFeedItem(data);
      onPost(item);
      reset();
    } catch (e: any) {
      setError(e.message || 'Failed to post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hp-subcard">
      <div className="hp-composer-tabs">
        {(['Post', 'Poll', 'Praise'] as PostTab[]).map((t) => (
          <button key={t} className={`hp-composer-tab ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); setError(''); }}>{t}</button>
        ))}
      </div>

      <textarea
        className="hp-composer-input"
        placeholder={tab === 'Post' ? 'Write your post here...' : tab === 'Poll' ? 'Ask your question...' : 'Write a praise message...'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      {tab === 'Poll' && (
        <div className="hp-poll-options">
          {pollOptions.map((opt, i) => (
            <div key={i} className="hp-poll-option-row">
              <input
                type="text"
                placeholder={`Option ${i + 1}`}
                value={opt}
                onChange={(e) => {
                  const next = [...pollOptions];
                  next[i] = e.target.value;
                  setPollOptions(next);
                }}
              />
              {pollOptions.length > 2 && (
                <button className="hp-poll-remove-btn" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>×</button>
              )}
            </div>
          ))}
          <button className="hp-poll-add-btn" onClick={() => setPollOptions([...pollOptions, ''])}>+ Add option</button>
          <div className="hp-poll-toggles">
            <label><input type="checkbox" checked={pollMultiChoice} onChange={(e) => setPollMultiChoice(e.target.checked)} /> Multi-choice</label>
            <label><input type="checkbox" checked={pollAnonymous} onChange={(e) => setPollAnonymous(e.target.checked)} /> Anonymous</label>
          </div>
        </div>
      )}

      {tab === 'Praise' && (
        <div className="hp-praise-fields">
          <select value={praiseTarget} onChange={(e) => setPraiseTarget(e.target.value)}>
            <option value="">Select person...</option>
            {users.map((u) => <option key={u._id} value={u._id}>{u.displayName}</option>)}
          </select>
          <select value={praiseCategory} onChange={(e) => setPraiseCategory(e.target.value)}>
            <option value="">Category (optional)</option>
            {PRAISE_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
      )}

      {error && <div className="hp-composer-error">{error}</div>}
      <button className="hp-composer-submit" onClick={handleSubmit} disabled={busy || !body.trim()}>
        {busy ? 'Posting...' : tab === 'Praise' ? 'Send Praise' : 'Post'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/dashboard/FeedComposer.tsx
git commit -m "feat(feed): add FeedComposer component"
```

---

### Task 6: Frontend — FeedCard Component

**Files:**
- Create: `web/src/dashboard/FeedCard.tsx`

**Interfaces:**
- Consumes: `FeedItem`, `toggleLike`, `addComment`, `deleteComment`, `deleteFeedItem`, `votePoll` from `feedApi.ts`, `useAuth()` from `authContext`
- Produces: `<FeedCard item={FeedItem} onUpdate={(item) => void} onDelete={(id) => void}>` component

- [ ] **Step 1: Create the FeedCard component**

Create `web/src/dashboard/FeedCard.tsx`:

```tsx
import { useState } from 'react';
import { IconHeart, IconHeartFilled, IconMessageCircle, IconTrash } from '@tabler/icons-react';
import { useAuth } from '../authContext';
import { FeedItem, toggleLike, addComment, deleteComment, deleteFeedItem, votePoll } from './feedApi';

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
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function FeedCard({ item, onUpdate, onDelete }: {
  item: FeedItem;
  onUpdate: (item: Partial<FeedItem> & { _id: string }) => void;
  onDelete: (id: string) => void;
}) {
  const { user } = useAuth();
  const userId = (user as any)?._id;
  const isOwner = item.author._id === userId;
  const roles: string[] = (user as any)?.roles || [];
  const canDelete = isOwner || roles.includes('admin') || roles.includes('hr');

  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleLike() {
    const result = await toggleLike(item._id);
    onUpdate({ _id: item._id, liked: result.liked, likeCount: result.likeCount });
  }

  async function handleComment() {
    if (!commentText.trim()) return;
    setBusy(true);
    try {
      const updated = await addComment(item._id, commentText);
      onUpdate({ _id: item._id, comments: updated.comments, commentCount: updated.commentCount });
      setCommentText('');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    await deleteFeedItem(item._id);
    onDelete(item._id);
  }

  async function handleVote(indices: number[]) {
    const result = await votePoll(item._id, indices);
    onUpdate({ _id: item._id, voteTally: result.voteTally, myVote: result.myVote });
  }

  const authorName = item.author?.displayName || 'Former Employee';

  return (
    <div className={`hp-feed-card ${item.type === 'praise' ? 'hp-feed-card--praise' : ''} ${item.type === 'announcement' ? 'hp-feed-card--announcement' : ''}`}>
      <div className="hp-feed-card-header">
        <div className="hp-avatar" style={{ background: colorFor(item.author?._id || ''), width: 32, height: 32, fontSize: 12 }}>
          {initials(authorName)}
        </div>
        <div className="hp-feed-card-meta">
          <span className="hp-feed-card-author">{authorName}</span>
          <span className="hp-feed-card-time">{timeAgo(item.createdAt)}</span>
        </div>
        {item.type === 'announcement' && <span className="hp-badge">Announcement</span>}
        {item.type === 'praise' && item.praiseCategory && (
          <span className="hp-badge hp-badge--praise">{item.praiseCategory}</span>
        )}
        {canDelete && (
          <button className="hp-icon-btn hp-feed-delete" onClick={handleDelete} aria-label="Delete">
            <IconTrash size={14} />
          </button>
        )}
      </div>

      {item.type === 'praise' && item.praiseTarget && (
        <div className="hp-praise-target">
          <div className="hp-avatar" style={{ background: colorFor(item.praiseTarget._id), width: 28, height: 28, fontSize: 11 }}>
            {initials(item.praiseTarget.displayName || 'Former Employee')}
          </div>
          <span>{item.praiseTarget.displayName || 'Former Employee'}</span>
        </div>
      )}

      <div className="hp-feed-card-body">{item.body}</div>

      {item.type === 'poll' && item.pollOptions && (
        <PollSection item={item} onVote={handleVote} />
      )}

      {item.type !== 'announcement' && (
        <div className="hp-feed-card-actions">
          <button className="hp-feed-action-btn" onClick={handleLike}>
            {item.liked ? <IconHeartFilled size={16} color="#ef4444" /> : <IconHeart size={16} />}
            <span>{item.likeCount || 0}</span>
          </button>
          <button className="hp-feed-action-btn" onClick={() => setShowComments(!showComments)}>
            <IconMessageCircle size={16} />
            <span>{item.commentCount || 0}</span>
          </button>
        </div>
      )}

      {showComments && item.type !== 'announcement' && (
        <div className="hp-feed-comments">
          {(item.comments || []).map((c) => (
            <div key={c._id} className="hp-feed-comment">
              <span className="hp-feed-comment-author">{c.author?.displayName || 'Former Employee'}</span>
              <span className="hp-feed-comment-body">{c.body}</span>
              <span className="hp-feed-comment-time">{timeAgo(c.createdAt)}</span>
            </div>
          ))}
          <div className="hp-feed-comment-input">
            <input
              type="text"
              placeholder="Write a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleComment()}
            />
            <button onClick={handleComment} disabled={busy || !commentText.trim()}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PollSection({ item, onVote }: { item: FeedItem; onVote: (indices: number[]) => void }) {
  const hasVoted = item.myVote != null;
  const totalVotes = Object.values(item.voteTally || {}).reduce((a, b) => a + b, 0);
  const [selected, setSelected] = useState<number[]>([]);

  function handleOptionClick(idx: number) {
    if (hasVoted) return;
    if (item.pollMultiChoice) {
      setSelected((prev) => prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]);
    } else {
      onVote([idx]);
    }
  }

  return (
    <div className="hp-poll-section">
      {(item.pollOptions || []).map((opt, idx) => {
        const count = item.voteTally?.[String(idx)] || 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isMyChoice = (item.myVote || []).includes(idx);
        const isSelected = selected.includes(idx);

        return (
          <button
            key={opt._id}
            className={`hp-poll-option ${hasVoted ? 'voted' : ''} ${isMyChoice ? 'my-vote' : ''} ${isSelected ? 'selected' : ''}`}
            onClick={() => handleOptionClick(idx)}
            disabled={hasVoted}
          >
            <span className="hp-poll-option-text">{opt.text}</span>
            {hasVoted && (
              <>
                <div className="hp-poll-bar" style={{ width: `${pct}%` }} />
                <span className="hp-poll-pct">{pct}%</span>
              </>
            )}
          </button>
        );
      })}
      {item.pollMultiChoice && !hasVoted && selected.length > 0 && (
        <button className="hp-poll-submit" onClick={() => onVote(selected)}>Submit Vote</button>
      )}
      <div className="hp-poll-meta">
        {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
        {item.pollAnonymous && <span className="hp-badge">Anonymous</span>}
        {item.pollMultiChoice && <span className="hp-badge">Multi-choice</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/dashboard/FeedCard.tsx
git commit -m "feat(feed): add FeedCard component with like, comment, poll vote"
```

---

### Task 7: Frontend — Wire Feed into HomePage

**Files:**
- Modify: `web/src/dashboard/HomePage.tsx` (replace static feed UI with live components)
- Modify: `web/src/dashboard/HomePage.css` (add feed styles)

**Interfaces:**
- Consumes: `FeedComposer`, `FeedCard`, `getFeed`, `FeedItem` type, `useAuth()`
- Produces: Working social feed on the home page

- [ ] **Step 1: Update RightFeed in HomePage.tsx**

In `web/src/dashboard/HomePage.tsx`, add imports at the top:

```tsx
import { FeedComposer } from './FeedComposer';
import { FeedCard } from './FeedCard';
import { getFeed, FeedItem as FeedItemType, createFeedItem } from './feedApi';
```

Replace the entire `RightFeed` function with:

```tsx
function RightFeed({ birthdaysToday, upcomingBirthdays, anniversaries, newJoinees, onWish }: {
  birthdaysToday: PeopleEntry[];
  upcomingBirthdays: PeopleEntry[];
  anniversaries: PeopleEntry[];
  newJoinees: PeopleEntry[];
  onWish: (emp: PeopleEntry) => void;
}) {
  const { user } = useAuth();
  const [feedTab, setFeedTab] = useState<FeedTab>('Organization');
  type CelTab = 'birthdays' | 'anniversaries' | 'joinees';
  const [celTab, setCelTab] = useState<CelTab>('birthdays');

  const [feedItems, setFeedItems] = useState<FeedItemType[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);

  const roles: string[] = (user as any)?.roles || [];
  const isAdminHr = roles.includes('admin') || roles.includes('hr');

  useEffect(() => {
    setFeedLoading(true);
    getFeed().then((res) => {
      setFeedItems(res.items);
      setFeedCursor(res.cursor);
    }).catch(() => {}).finally(() => setFeedLoading(false));
  }, []);

  function handleNewPost(item: FeedItemType) {
    setFeedItems((prev) => [item, ...prev]);
  }

  function handleUpdate(update: Partial<FeedItemType> & { _id: string }) {
    setFeedItems((prev) => prev.map((item) =>
      item._id === update._id ? { ...item, ...update } : item
    ));
  }

  function handleDeleteItem(id: string) {
    setFeedItems((prev) => prev.filter((item) => item._id !== id));
  }

  async function loadMore() {
    if (!feedCursor || feedLoading) return;
    setFeedLoading(true);
    try {
      const res = await getFeed(feedCursor);
      setFeedItems((prev) => [...prev, ...res.items]);
      setFeedCursor(res.cursor);
    } finally {
      setFeedLoading(false);
    }
  }

  const announcements = feedItems.filter((i) => i.type === 'announcement');
  const regularItems = feedItems.filter((i) => i.type !== 'announcement');

  const [showAnnModal, setShowAnnModal] = useState(false);
  const [annBody, setAnnBody] = useState('');
  const [annBusy, setAnnBusy] = useState(false);

  async function handleCreateAnnouncement() {
    if (!annBody.trim()) return;
    setAnnBusy(true);
    try {
      const item = await createFeedItem({ type: 'announcement', body: annBody });
      setFeedItems((prev) => [item, ...prev]);
      setAnnBody('');
      setShowAnnModal(false);
    } finally {
      setAnnBusy(false);
    }
  }

  return (
    <div className="hp-right-col">
      <div className="hp-feed-tabs">
        {(['Organization', 'Product Design'] as FeedTab[]).map((t) => (
          <button key={t} className={`hp-feed-tab ${feedTab === t ? 'active' : ''}`} onClick={() => setFeedTab(t)}>{t}</button>
        ))}
      </div>

      <FeedComposer onPost={handleNewPost} />

      <div className="hp-announcements">
        {announcements.length === 0 ? (
          <span className="hp-announcements-empty">No announcements</span>
        ) : (
          <div className="hp-announcements-list">
            {announcements.map((a) => (
              <div key={a._id} className="hp-announcement-item">
                <span className="hp-announcement-body">{a.body}</span>
                <span className="hp-announcement-time">{new Date(a.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
        {isAdminHr && (
          <button className="hp-add-btn" aria-label="Add announcement" onClick={() => setShowAnnModal(true)}>
            <IconPlus size={16} />
          </button>
        )}
      </div>

      {showAnnModal && (
        <div className="hp-modal-overlay" onClick={() => setShowAnnModal(false)}>
          <div className="hp-modal" onClick={(e) => e.stopPropagation()}>
            <h3>New Announcement</h3>
            <textarea value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="Write announcement..." />
            <div className="hp-modal-actions">
              <button onClick={() => setShowAnnModal(false)}>Cancel</button>
              <button onClick={handleCreateAnnouncement} disabled={annBusy || !annBody.trim()}>
                {annBusy ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="hp-feed-list">
        {regularItems.map((item) => (
          <FeedCard key={item._id} item={item} onUpdate={handleUpdate} onDelete={handleDeleteItem} />
        ))}
        {feedCursor && (
          <button className="hp-load-more" onClick={loadMore} disabled={feedLoading}>
            {feedLoading ? 'Loading...' : 'Load more'}
          </button>
        )}
        {!feedLoading && regularItems.length === 0 && (
          <div className="hp-empty"><p>No posts yet. Be the first!</p></div>
        )}
      </div>

      <div className="hp-subcard">
        <div className="hp-cel-tabs-row">
          <button className={`hp-cel-tab ${celTab === 'birthdays' ? 'active' : ''}`} onClick={() => setCelTab('birthdays')}>
            <IconGift size={13} />{birthdaysToday.length} Birthday{birthdaysToday.length !== 1 ? 's' : ''}
          </button>
          <button className={`hp-cel-tab ${celTab === 'anniversaries' ? 'active' : ''}`} onClick={() => setCelTab('anniversaries')}>
            <IconConfetti size={13} />{anniversaries.length} Work Anniversar{anniversaries.length !== 1 ? 'ies' : 'y'}
          </button>
          <button className={`hp-cel-tab ${celTab === 'joinees' ? 'active' : ''}`} onClick={() => setCelTab('joinees')}>
            <IconUserPlus size={13} />{newJoinees.length} New Joinee{newJoinees.length !== 1 ? 's' : ''}
          </button>
          <button className="hp-cel-collapse" aria-label="Collapse">
            <IconChevronLeft size={14} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </div>

        {celTab === 'birthdays' && (
          <>
            {birthdaysToday.length > 0 && (
              <>
                <div className="hp-cel-section-label">Birthdays today</div>
                <div className="hp-avatar-row">
                  {birthdaysToday.map((e) => <AvatarCard key={e._id} emp={e} showWhen={false} onWish={onWish} />)}
                </div>
              </>
            )}
            {upcomingBirthdays.length > 0 && (
              <>
                <div className="hp-cel-section-label" style={{ marginTop: 14 }}>Upcoming Birthdays</div>
                <div className="hp-avatar-row hp-avatar-row--wrap">
                  {upcomingBirthdays.map((e) => <AvatarCard key={e._id} emp={e} showWhen />)}
                </div>
              </>
            )}
            {birthdaysToday.length === 0 && upcomingBirthdays.length === 0 && (
              <div className="hp-empty"><p>No upcoming birthdays.</p></div>
            )}
          </>
        )}

        {celTab === 'anniversaries' && (
          <>
            {anniversaries.length > 0 ? (
              <div className="hp-avatar-row hp-avatar-row--wrap">
                {anniversaries.map((e) => (
                  <AvatarCard key={e._id} emp={{ ...e, when: `${e.years} yr${(e.years ?? 0) !== 1 ? 's' : ''}` }} showWhen />
                ))}
              </div>
            ) : (
              <div className="hp-empty"><p>No work anniversaries today.</p></div>
            )}
          </>
        )}

        {celTab === 'joinees' && (
          <>
            {newJoinees.length > 0 ? (
              <div className="hp-avatar-row hp-avatar-row--wrap">
                {newJoinees.map((e) => (
                  <AvatarCard key={e._id} emp={{ ...e, when: e.joined ? new Date(e.joined).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '' }} showWhen />
                ))}
              </div>
            ) : (
              <div className="hp-empty"><p>No new joinees this month.</p></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remove the unused `PostTab` type and static `postTab` state**

The `PostTab` type and `postTab` state at the module level are no longer needed since `FeedComposer` manages its own tabs. Remove the line:
```tsx
type PostTab = 'Post' | 'Poll' | 'Praise';
```

- [ ] **Step 3: Add feed CSS styles**

Append to `web/src/dashboard/HomePage.css`:

```css
/* ─── Feed ─────────────────────────────────────────────────────────────── */

.hp-feed-list { display: flex; flex-direction: column; gap: 12px; }

.hp-feed-card {
  background: var(--hp-card-bg, #fff);
  border: 1px solid var(--hp-border, #e5e7eb);
  border-radius: 10px;
  padding: 14px;
}
.hp-feed-card--praise { border-left: 3px solid #8b5cf6; }
.hp-feed-card--announcement { background: #eff6ff; border-left: 3px solid #3b82f6; }

.hp-feed-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.hp-feed-card-meta { flex: 1; display: flex; flex-direction: column; }
.hp-feed-card-author { font-weight: 600; font-size: 13px; }
.hp-feed-card-time { font-size: 11px; color: var(--hp-text-muted, #888); }
.hp-feed-card-body { font-size: 14px; line-height: 1.5; margin-bottom: 8px; white-space: pre-wrap; }
.hp-feed-delete { opacity: 0; transition: opacity .15s; }
.hp-feed-card:hover .hp-feed-delete { opacity: 1; }

.hp-praise-target { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-weight: 500; font-size: 13px; }

.hp-feed-card-actions { display: flex; gap: 12px; border-top: 1px solid var(--hp-border, #e5e7eb); padding-top: 8px; }
.hp-feed-action-btn { display: flex; align-items: center; gap: 4px; background: none; border: none; cursor: pointer; font-size: 13px; color: var(--hp-text-muted, #666); }
.hp-feed-action-btn:hover { color: var(--hp-text, #111); }

.hp-feed-comments { padding-top: 8px; border-top: 1px solid var(--hp-border, #e5e7eb); }
.hp-feed-comment { display: flex; gap: 6px; padding: 4px 0; font-size: 13px; }
.hp-feed-comment-author { font-weight: 600; white-space: nowrap; }
.hp-feed-comment-body { flex: 1; }
.hp-feed-comment-time { font-size: 11px; color: var(--hp-text-muted, #888); white-space: nowrap; }
.hp-feed-comment-input { display: flex; gap: 6px; margin-top: 8px; }
.hp-feed-comment-input input { flex: 1; border: 1px solid var(--hp-border, #e5e7eb); border-radius: 6px; padding: 6px 10px; font-size: 13px; }
.hp-feed-comment-input button { padding: 6px 14px; border: none; border-radius: 6px; background: #4f6ef7; color: #fff; cursor: pointer; font-size: 13px; }
.hp-feed-comment-input button:disabled { opacity: .5; }

/* Poll */
.hp-poll-section { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.hp-poll-option {
  position: relative; display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border: 1px solid var(--hp-border, #e5e7eb); border-radius: 8px;
  background: #fff; cursor: pointer; overflow: hidden; font-size: 13px;
}
.hp-poll-option:disabled { cursor: default; }
.hp-poll-option.selected { border-color: #4f6ef7; background: #f0f4ff; }
.hp-poll-option.my-vote { border-color: #4f6ef7; font-weight: 600; }
.hp-poll-option-text { position: relative; z-index: 1; }
.hp-poll-bar { position: absolute; left: 0; top: 0; bottom: 0; background: #e0e7ff; transition: width .3s ease; }
.hp-poll-pct { position: relative; z-index: 1; font-weight: 600; font-size: 12px; }
.hp-poll-submit { align-self: flex-end; padding: 6px 16px; border: none; border-radius: 6px; background: #4f6ef7; color: #fff; cursor: pointer; font-size: 13px; }
.hp-poll-meta { font-size: 12px; color: var(--hp-text-muted, #888); display: flex; align-items: center; gap: 8px; }

/* Composer extras */
.hp-poll-options { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; }
.hp-poll-option-row { display: flex; gap: 6px; }
.hp-poll-option-row input { flex: 1; border: 1px solid var(--hp-border, #e5e7eb); border-radius: 6px; padding: 6px 10px; font-size: 13px; }
.hp-poll-remove-btn { border: none; background: none; cursor: pointer; color: #ef4444; font-size: 16px; }
.hp-poll-add-btn { align-self: flex-start; border: none; background: none; cursor: pointer; color: #4f6ef7; font-size: 13px; }
.hp-poll-toggles { display: flex; gap: 16px; font-size: 13px; }
.hp-poll-toggles label { display: flex; align-items: center; gap: 4px; cursor: pointer; }

.hp-praise-fields { display: flex; gap: 8px; padding: 8px 0; }
.hp-praise-fields select { flex: 1; border: 1px solid var(--hp-border, #e5e7eb); border-radius: 6px; padding: 6px 10px; font-size: 13px; }

.hp-composer-error { color: #ef4444; font-size: 12px; padding: 4px 0; }
.hp-composer-submit {
  width: 100%; padding: 8px; border: none; border-radius: 8px;
  background: #4f6ef7; color: #fff; cursor: pointer; font-size: 14px; font-weight: 500; margin-top: 8px;
}
.hp-composer-submit:disabled { opacity: .5; cursor: not-allowed; }

/* Announcement modal */
.hp-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.hp-modal { background: #fff; border-radius: 12px; padding: 24px; width: 400px; max-width: 90vw; }
.hp-modal h3 { margin: 0 0 12px; font-size: 16px; }
.hp-modal textarea { width: 100%; min-height: 80px; border: 1px solid var(--hp-border, #e5e7eb); border-radius: 8px; padding: 10px; font-size: 14px; resize: vertical; }
.hp-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.hp-modal-actions button { padding: 8px 16px; border: 1px solid var(--hp-border, #e5e7eb); border-radius: 8px; cursor: pointer; font-size: 13px; }
.hp-modal-actions button:last-child { background: #4f6ef7; color: #fff; border: none; }

.hp-announcements-list { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.hp-announcement-item { display: flex; justify-content: space-between; font-size: 13px; }
.hp-announcement-body { font-weight: 500; }
.hp-announcement-time { color: var(--hp-text-muted, #888); font-size: 11px; }

.hp-load-more { width: 100%; padding: 10px; border: 1px solid var(--hp-border, #e5e7eb); border-radius: 8px; background: #fff; cursor: pointer; font-size: 13px; color: #4f6ef7; }
.hp-load-more:disabled { opacity: .5; cursor: not-allowed; }

.hp-badge--praise { background: #8b5cf6; color: #fff; }
```

- [ ] **Step 4: Verify the build compiles**

Run: `cd web && npx vite build 2>&1 | tail -5`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add web/src/dashboard/HomePage.tsx web/src/dashboard/HomePage.css
git commit -m "feat(feed): wire live feed into HomePage with composer, cards, and styles"
```

---

### Task 8: End-to-End Verification and Polish

**Files:**
- Potentially modify any file from Tasks 1-7 if issues found

**Interfaces:**
- Consumes: Everything from Tasks 1-7
- Produces: Verified, working social feed feature

- [ ] **Step 1: Run all backend tests**

Run: `cd auth-api && node --test`
Expected: All existing tests plus feed tests PASS

- [ ] **Step 2: Run frontend build**

Run: `cd web && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Start backend and frontend dev servers**

Start the backend:
```bash
cd auth-api && node src/index.js &
```
Start the frontend:
```bash
cd web && npx vite --open
```

- [ ] **Step 4: Manual smoke test**

Test in browser:
1. Log in → Home page loads → Feed section visible in right column
2. Post tab → type text → click Post → post appears in feed
3. Poll tab → add question + 2 options → toggle anonymous → Post → poll card appears
4. Click a poll option → vote registers, percentage bars show
5. Praise tab → pick a person → type message → Send Praise → praise card with highlight
6. Like a post → heart toggles, count updates
7. Comment on a post → comment appears
8. As admin: click + on announcements → modal opens → post announcement → appears pinned
9. Delete own post → disappears from feed

- [ ] **Step 5: Fix any issues found during smoke test**

Address bugs or styling issues.

- [ ] **Step 6: Commit fixes if any**

```bash
git add -A
git commit -m "fix(feed): address smoke test issues"
```
