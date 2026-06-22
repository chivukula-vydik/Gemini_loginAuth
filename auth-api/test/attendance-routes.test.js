import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Attendance, todayStr } = await import('../src/models/Attendance.js');
const { Leave } = await import('../src/models/Leave.js');
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

test('POST /attendance/checkin creates a doc with partial status', async () => {
  const emp = await User.create({ email: 'att-ci@x.com', displayName: 'E', role: 'employee' });
  const res = await request(app).post('/attendance/checkin')
    .set('Authorization', bearer(emp)).send({ punchType: 'office' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'partial');
  assert.ok(res.body.checkIn);
  const saved = await Attendance.findOne({ userId: emp._id, date: todayStr() });
  assert.ok(saved);
  assert.equal(saved.punchType, 'office');
});

test('POST /attendance/checkin twice in a row returns 409', async () => {
  const emp = await User.create({ email: 'att-dbl@x.com', displayName: 'E', role: 'employee' });
  const first = await request(app).post('/attendance/checkin')
    .set('Authorization', bearer(emp)).send({ punchType: 'office' });
  assert.equal(first.status, 200);
  const second = await request(app).post('/attendance/checkin')
    .set('Authorization', bearer(emp)).send({ punchType: 'office' });
  assert.equal(second.status, 409);
});

test('POST /attendance/checkout recalculates minutes and derives status', async () => {
  const emp = await User.create({ email: 'att-co@x.com', displayName: 'E', role: 'employee' });
  await request(app).post('/attendance/checkin')
    .set('Authorization', bearer(emp)).send({ punchType: 'office' });

  const res = await request(app).post('/attendance/checkout')
    .set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  assert.ok(res.body.checkOut);
  assert.equal(typeof res.body.totalMinutes, 'number');
  assert.ok(['present', 'partial'].includes(res.body.status));
});

test('POST /attendance/regularise creates a pending request', async () => {
  const emp = await User.create({ email: 'att-reg@x.com', displayName: 'E', role: 'employee' });
  const date = todayStr();
  const res = await request(app).post('/attendance/regularise')
    .set('Authorization', bearer(emp)).send({ date, reason: 'forgot to punch', correctedCheckIn: '09:30', correctedCheckOut: '18:30' });
  assert.equal(res.status, 200);
  assert.equal(res.body.regularise.status, 'pending');
  assert.equal(res.body.regularise.reason, 'forgot to punch');
});

test('PATCH /attendance/regularise/:id/decide approved applies corrected times', async () => {
  const pm = await User.create({ email: 'att-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'att-emp2@x.com', displayName: 'E', role: 'employee' });
  const date = todayStr();
  const submitted = await request(app).post('/attendance/regularise')
    .set('Authorization', bearer(emp)).send({ date, reason: 'missed punch', correctedCheckIn: '09:30', correctedCheckOut: '18:30' });

  const decided = await request(app).patch(`/attendance/regularise/${submitted.body._id}/decide`)
    .set('Authorization', bearer(pm)).send({ decision: 'approved' });
  assert.equal(decided.status, 200);
  assert.equal(decided.body.regularise.status, 'approved');
  assert.ok(decided.body.checkIn);
  assert.ok(decided.body.checkOut);
  assert.equal(decided.body.effectiveMinutes, 540);
  assert.equal(decided.body.status, 'present');
});

test('GET /attendance/regularise/pending is forbidden for employees', async () => {
  const emp = await User.create({ email: 'att-forb@x.com', displayName: 'E', role: 'employee' });
  const res = await request(app).get('/attendance/regularise/pending').set('Authorization', bearer(emp));
  assert.equal(res.status, 403);
});

test('POST /leave validates date format and rejects endDate before startDate', async () => {
  const emp = await User.create({ email: 'lv-fmt@x.com', displayName: 'E', role: 'employee' });
  const badFormat = await request(app).post('/leave')
    .set('Authorization', bearer(emp)).send({ type: 'casual', startDate: '22-06-2026', endDate: '23-06-2026', reason: 'x' });
  assert.equal(badFormat.status, 400);

  const badOrder = await request(app).post('/leave')
    .set('Authorization', bearer(emp)).send({ type: 'casual', startDate: '2026-06-25', endDate: '2026-06-20', reason: 'x' });
  assert.equal(badOrder.status, 400);
});

test('PATCH /leave/:id/decide approved stamps attendance days as leave', async () => {
  const pm = await User.create({ email: 'lv-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'lv-emp@x.com', displayName: 'E', role: 'employee' });
  // 2026-06-22 is a Monday; range covers Mon..Tue (two weekdays).
  const applied = await request(app).post('/leave')
    .set('Authorization', bearer(emp)).send({ type: 'casual', startDate: '2026-06-22', endDate: '2026-06-23', reason: 'trip' });
  assert.equal(applied.status, 201);

  const decided = await request(app).patch(`/leave/${applied.body._id}/decide`)
    .set('Authorization', bearer(pm)).send({ decision: 'approved' });
  assert.equal(decided.status, 200);
  assert.equal(decided.body.status, 'approved');

  const day1 = await Attendance.findOne({ userId: emp._id, date: '2026-06-22' });
  const day2 = await Attendance.findOne({ userId: emp._id, date: '2026-06-23' });
  assert.equal(day1.status, 'leave');
  assert.equal(day2.status, 'leave');
});

test('GET /leave/pending is forbidden for employees', async () => {
  const emp = await User.create({ email: 'lv-forb@x.com', displayName: 'E', role: 'employee' });
  const res = await request(app).get('/leave/pending').set('Authorization', bearer(emp));
  assert.equal(res.status, 403);
});
