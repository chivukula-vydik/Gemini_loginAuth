import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Attendance } = await import('../src/models/Attendance.js');
const { Leave } = await import('../src/models/Leave.js');
const { signAccessToken } = await import('../src/services/tokens.js');

let mongod;
let app;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp({ enabled: [], shift: { startHour: 10, startMinute: 0, endHour: 19, endMinute: 0, durationMinutes: 540 } });
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function bearer(user) {
  return `Bearer ${signAccessToken(user)}`;
}

// --- 4.1 Shift configuration ---

test('GET /attendance/config returns the configured shift', async () => {
  const emp = await User.create({ email: 'shift-1@x.com', displayName: 'E', role: 'employee' });
  const res = await request(app).get('/attendance/config').set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  assert.equal(res.body.startHour, 10);
  assert.equal(res.body.startMinute, 0);
});

test('GET /attendance/stats uses the configured shift start to determine lateCount', async () => {
  const emp = await User.create({ email: 'shift-2@x.com', displayName: 'E', role: 'employee' });
  // Configured shift start is 10:00. A 9:45 check-in is on time under this config.
  await Attendance.create({
    userId: emp._id, date: '2026-07-06', status: 'present',
    checkIn: new Date('2026-07-06T09:45:00'), checkOut: new Date('2026-07-06T18:45:00'),
    effectiveMinutes: 540,
  });
  const res = await request(app).get('/attendance/stats?year=2026&month=7').set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  assert.equal(res.body.lateCount, 0);
});

// --- 4.3 Checkin idempotency under races ---

test('POST /attendance/checkin handles a concurrent double-tap without a 500', async () => {
  const emp = await User.create({ email: 'race-1@x.com', displayName: 'E', role: 'employee' });
  const [first, second] = await Promise.all([
    request(app).post('/attendance/checkin').set('Authorization', bearer(emp)).send({ punchType: 'office' }),
    request(app).post('/attendance/checkin').set('Authorization', bearer(emp)).send({ punchType: 'office' }),
  ]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 409]);
});

// --- 4.4 Regularise stacking guard ---

test('POST /attendance/regularise rejects a second request while one is pending', async () => {
  const emp = await User.create({ email: 'reg-stack@x.com', displayName: 'E', role: 'employee' });
  const first = await request(app).post('/attendance/regularise')
    .set('Authorization', bearer(emp)).send({ date: '2026-07-08', reason: 'forgot to punch' });
  assert.equal(first.status, 200);

  const second = await request(app).post('/attendance/regularise')
    .set('Authorization', bearer(emp)).send({ date: '2026-07-08', reason: 'forgot again' });
  assert.equal(second.status, 409);
  assert.match(second.body.error, /already pending/);
});

// --- 4.5 Leave/attendance conflict surfacing ---

test('Approving leave over a day the employee already clocked in appends a conflict note instead of overwriting', async () => {
  const pm = await User.create({ email: 'conflict-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'conflict-emp@x.com', displayName: 'E', role: 'employee' });

  await Attendance.create({
    userId: emp._id, date: '2026-07-06', status: 'present',
    checkIn: new Date('2026-07-06T10:00:00'), checkOut: new Date('2026-07-06T19:00:00'),
    effectiveMinutes: 540,
  });

  const applied = await request(app).post('/leave')
    .set('Authorization', bearer(emp))
    .send({ type: 'casual', startDate: '2026-07-06', endDate: '2026-07-06', reason: 'mistaken request' });
  await request(app).patch(`/leave/${applied.body._id}/decide`)
    .set('Authorization', bearer(pm)).send({ decision: 'approved' });

  const day = await Attendance.findOne({ userId: emp._id, date: '2026-07-06' });
  assert.equal(day.status, 'present'); // not overwritten to "leave"
  assert.match(day.note, /conflict:/);
});

// --- 3.3 Leave cancellation ---

test('DELETE /leave/:id cancels a pending request owned by the caller', async () => {
  const emp = await User.create({ email: 'cancel-1@x.com', displayName: 'E', role: 'employee' });
  const applied = await request(app).post('/leave')
    .set('Authorization', bearer(emp))
    .send({ type: 'casual', startDate: '2026-07-09', endDate: '2026-07-09', reason: 'plans changed' });

  const res = await request(app).delete(`/leave/${applied.body._id}`).set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  assert.equal(await Leave.findById(applied.body._id), null);
});

test('DELETE /leave/:id is forbidden for a non-owner', async () => {
  const emp = await User.create({ email: 'cancel-owner@x.com', displayName: 'E', role: 'employee' });
  const other = await User.create({ email: 'cancel-other@x.com', displayName: 'O', role: 'employee' });
  const applied = await request(app).post('/leave')
    .set('Authorization', bearer(emp))
    .send({ type: 'casual', startDate: '2026-07-10', endDate: '2026-07-10', reason: 'x' });

  const res = await request(app).delete(`/leave/${applied.body._id}`).set('Authorization', bearer(other));
  assert.equal(res.status, 403);
  assert.notEqual(await Leave.findById(applied.body._id), null);
});

test('DELETE /leave/:id rejects cancelling a non-pending request', async () => {
  const pm = await User.create({ email: 'cancel-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'cancel-decided@x.com', displayName: 'E', role: 'employee' });
  const applied = await request(app).post('/leave')
    .set('Authorization', bearer(emp))
    .send({ type: 'casual', startDate: '2026-07-11', endDate: '2026-07-11', reason: 'x' });
  await request(app).patch(`/leave/${applied.body._id}/decide`)
    .set('Authorization', bearer(pm)).send({ decision: 'approved' });

  const res = await request(app).delete(`/leave/${applied.body._id}`).set('Authorization', bearer(emp));
  assert.equal(res.status, 409);
});

test('DELETE /leave/:id returns 404 for a missing request', async () => {
  const emp = await User.create({ email: 'cancel-404@x.com', displayName: 'E', role: 'employee' });
  const res = await request(app).delete('/leave/507f1f77bcf86cd799439011').set('Authorization', bearer(emp));
  assert.equal(res.status, 404);
});
