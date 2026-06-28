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
  await PollVote.ensureIndexes();
  const pollId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  await PollVote.create({ pollId, userId, optionIndices: [0] });
  await assert.rejects(
    () => PollVote.create({ pollId, userId, optionIndices: [1] }),
    (err) => err.code === 11000,
  );
});
