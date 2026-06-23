import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Timesheet } = await import('../src/models/Timesheet.js');
const { signAccessToken } = await import('../src/services/tokens.js');

let mongod;
let app;

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

test('PATCH /timesheets/review/:id with decision=return stores the rejection reason', async () => {
  const emp = await User.create({ email: 'ts-emp1@x.com', displayName: 'Emp', role: 'employee' });
  const pm = await User.create({ email: 'ts-pm1@x.com', displayName: 'PM', role: 'pm' });
  const doc = await Timesheet.create({ userId: emp._id, weekStart: '2024-01-01', status: 'submitted' });

  const res = await request(app).patch(`/timesheets/review/${doc._id}`)
    .set('Authorization', bearer(pm)).send({ decision: 'return', reason: 'Please add notes to Monday entries.' });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'returned');

  const saved = await Timesheet.findById(doc._id);
  assert.equal(saved.status, 'returned');
  assert.equal(saved.rejectionReason, 'Please add notes to Monday entries.');
});

test('PATCH /timesheets/review/:id with decision=return truncates reason to 1000 chars', async () => {
  const emp = await User.create({ email: 'ts-emp2@x.com', displayName: 'Emp', role: 'employee' });
  const pm = await User.create({ email: 'ts-pm2@x.com', displayName: 'PM', role: 'pm' });
  const doc = await Timesheet.create({ userId: emp._id, weekStart: '2024-01-08', status: 'submitted' });
  const longReason = 'x'.repeat(1500);

  const res = await request(app).patch(`/timesheets/review/${doc._id}`)
    .set('Authorization', bearer(pm)).send({ decision: 'return', reason: longReason });

  assert.equal(res.status, 200);
  const saved = await Timesheet.findById(doc._id);
  assert.equal(saved.rejectionReason.length, 1000);
});

test('PATCH /timesheets/review/:id with decision=approve clears any rejection reason', async () => {
  const emp = await User.create({ email: 'ts-emp3@x.com', displayName: 'Emp', role: 'employee' });
  const pm = await User.create({ email: 'ts-pm3@x.com', displayName: 'PM', role: 'pm' });
  const doc = await Timesheet.create({
    userId: emp._id, weekStart: '2024-01-15', status: 'submitted', rejectionReason: 'stale reason from a prior cycle',
  });

  const res = await request(app).patch(`/timesheets/review/${doc._id}`)
    .set('Authorization', bearer(pm)).send({ decision: 'approve' });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'approved');
  const saved = await Timesheet.findById(doc._id);
  assert.equal(saved.rejectionReason, '');
});

test('GET /timesheets/:weekStart includes rejectionReason for a returned week', async () => {
  const emp = await User.create({ email: 'ts-emp4@x.com', displayName: 'Emp', role: 'employee' });
  await Timesheet.create({
    userId: emp._id, weekStart: '2024-01-22', status: 'returned', rejectionReason: 'Missing hours on Friday.',
  });

  const res = await request(app).get('/timesheets/2024-01-22')
    .set('Authorization', bearer(emp));

  assert.equal(res.status, 200);
  assert.equal(res.body.rejectionReason, 'Missing hours on Friday.');
});

test('GET /timesheets/:weekStart returns an empty rejectionReason when there is no timesheet doc', async () => {
  const emp = await User.create({ email: 'ts-emp5@x.com', displayName: 'Emp', role: 'employee' });

  const res = await request(app).get('/timesheets/2024-02-05')
    .set('Authorization', bearer(emp));

  assert.equal(res.status, 200);
  assert.equal(res.body.rejectionReason, '');
});
