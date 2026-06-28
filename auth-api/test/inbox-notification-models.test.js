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
