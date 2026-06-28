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
