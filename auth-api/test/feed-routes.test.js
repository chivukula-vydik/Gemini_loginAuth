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
    await FeedItem.create({ type: 'post', author: user._id, body: 'Old post' });
    await FeedItem.create({
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
