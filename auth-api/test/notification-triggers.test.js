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
