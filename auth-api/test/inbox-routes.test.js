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
