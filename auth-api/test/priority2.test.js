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
const { Project } = await import('../src/models/Project.js');
const { LeaveBalance } = await import('../src/models/LeaveBalance.js');
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

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Leave balance / quota ---

test('GET /leave/balance creates a default balance with the standard quotas', async () => {
  const emp = await User.create({ email: 'bal-1@x.com', displayName: 'E', role: 'employee' });
  const res = await request(app).get('/leave/balance').set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  assert.equal(res.body.casual.total, 12);
  assert.equal(res.body.sick.total, 6);
  assert.equal(res.body.earned.total, 15);
  assert.equal(res.body.casual.remaining, 12);
});

test('POST /leave rejects a request that exceeds the remaining balance', async () => {
  const emp = await User.create({ email: 'bal-2@x.com', displayName: 'E', role: 'employee' });
  // Sick quota is 6 days; ask for a 10-weekday range (two full work weeks).
  const res = await request(app).post('/leave')
    .set('Authorization', bearer(emp))
    .send({ type: 'sick', startDate: '2026-07-06', endDate: '2026-07-17', reason: 'long illness' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /insufficient sick leave balance/);
});

test('Approving leave increments used balance by requestedDays, unpaid leave is not tracked', async () => {
  const pm = await User.create({ email: 'bal-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'bal-3@x.com', displayName: 'E', role: 'employee' });

  // 2026-07-06 (Mon) .. 2026-07-07 (Tue) — 2 working days.
  const applied = await request(app).post('/leave')
    .set('Authorization', bearer(emp))
    .send({ type: 'casual', startDate: '2026-07-06', endDate: '2026-07-07', reason: 'trip' });
  assert.equal(applied.status, 201);
  assert.equal(applied.body.requestedDays, 2);

  await request(app).patch(`/leave/${applied.body._id}/decide`)
    .set('Authorization', bearer(pm)).send({ decision: 'approved' });

  const balance = await LeaveBalance.findOne({ userId: emp._id, year: 2026 });
  assert.equal(balance.casual.used, 2);

  // Unpaid leave should never touch the balance.
  const unpaid = await request(app).post('/leave')
    .set('Authorization', bearer(emp))
    .send({ type: 'unpaid', startDate: '2026-07-08', endDate: '2026-07-08', reason: 'personal' });
  await request(app).patch(`/leave/${unpaid.body._id}/decide`)
    .set('Authorization', bearer(pm)).send({ decision: 'approved' });

  const balanceAfter = await LeaveBalance.findOne({ userId: emp._id, year: 2026 });
  assert.equal(balanceAfter.casual.used, 2); // unchanged
});

// --- Half-day leave ---

test('POST /leave with halfDay charges 0.5 days and rejects multi-day half-day requests', async () => {
  const emp = await User.create({ email: 'half-1@x.com', displayName: 'E', role: 'employee' });

  const multiDay = await request(app).post('/leave')
    .set('Authorization', bearer(emp))
    .send({ type: 'casual', startDate: '2026-07-06', endDate: '2026-07-07', halfDay: 'first', reason: 'x' });
  assert.equal(multiDay.status, 400);

  const single = await request(app).post('/leave')
    .set('Authorization', bearer(emp))
    .send({ type: 'casual', startDate: '2026-07-06', endDate: '2026-07-06', halfDay: 'second', reason: 'x' });
  assert.equal(single.status, 201);
  assert.equal(single.body.requestedDays, 0.5);
  assert.equal(single.body.halfDay, 'second');
});

test('Approving a half-day leave stamps attendance with a half-day note', async () => {
  const pm = await User.create({ email: 'half-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'half-2@x.com', displayName: 'E', role: 'employee' });

  const applied = await request(app).post('/leave')
    .set('Authorization', bearer(emp))
    .send({ type: 'casual', startDate: '2026-07-06', endDate: '2026-07-06', halfDay: 'first', reason: 'appt' });
  await request(app).patch(`/leave/${applied.body._id}/decide`)
    .set('Authorization', bearer(pm)).send({ decision: 'approved' });

  const day = await Attendance.findOne({ userId: emp._id, date: '2026-07-06' });
  assert.equal(day.status, 'leave');
  assert.match(day.note, /half day, morning/);
});

// --- Holiday calendar ---

test('POST /holidays is admin-only and rejects duplicate dates', async () => {
  const admin = await User.create({ email: 'hol-admin@x.com', displayName: 'A', role: 'admin' });
  const emp = await User.create({ email: 'hol-emp@x.com', displayName: 'E', role: 'employee' });

  const forbidden = await request(app).post('/holidays')
    .set('Authorization', bearer(emp)).send({ date: '2026-08-15', name: 'Independence Day' });
  assert.equal(forbidden.status, 403);

  const created = await request(app).post('/holidays')
    .set('Authorization', bearer(admin)).send({ date: '2026-08-15', name: 'Independence Day' });
  assert.equal(created.status, 201);

  const dup = await request(app).post('/holidays')
    .set('Authorization', bearer(admin)).send({ date: '2026-08-15', name: 'Some Other Name' });
  assert.equal(dup.status, 409);
});

test('GET /attendance/month merges holidays as synthetic entries without persisting them', async () => {
  const admin = await User.create({ email: 'hol-month-admin@x.com', displayName: 'A', role: 'admin' });
  const emp = await User.create({ email: 'hol-month@x.com', displayName: 'E', role: 'employee' });
  await request(app).post('/holidays')
    .set('Authorization', bearer(admin)).send({ date: '2026-09-02', name: 'Founders Day' });

  const res = await request(app).get('/attendance/month?year=2026&month=9').set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  const holidayRow = res.body.find((d) => d.date === '2026-09-02');
  assert.ok(holidayRow);
  assert.equal(holidayRow.status, 'holiday');
  assert.equal(holidayRow.note, 'Founders Day');

  const persisted = await Attendance.findOne({ userId: emp._id, date: '2026-09-02' });
  assert.equal(persisted, null);
});

test('GET /attendance/range returns docs for an arbitrary date span, merging holiday placeholders', async () => {
  const admin = await User.create({ email: 'range-admin@x.com', displayName: 'A', role: 'admin' });
  const emp = await User.create({ email: 'range-emp@x.com', displayName: 'E', role: 'employee' });
  await request(app).post('/holidays')
    .set('Authorization', bearer(admin)).send({ date: '2026-11-03', name: 'Mid-week Holiday' });
  await Attendance.create({ userId: emp._id, date: '2026-11-01', status: 'present', effectiveMinutes: 480 });

  const res = await request(app)
    .get('/attendance/range?start=2026-11-01&end=2026-11-05')
    .set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  const present = res.body.find((d) => d.date === '2026-11-01');
  assert.equal(present.status, 'present');
  const holiday = res.body.find((d) => d.date === '2026-11-03');
  assert.equal(holiday.status, 'holiday');
  assert.equal(holiday.note, 'Mid-week Holiday');
});

test('GET /attendance/range spanning two calendar months returns both months\' docs', async () => {
  const emp = await User.create({ email: 'range-span@x.com', displayName: 'E', role: 'employee' });
  await Attendance.create({ userId: emp._id, date: '2026-01-30', status: 'present', effectiveMinutes: 480 });
  await Attendance.create({ userId: emp._id, date: '2026-02-02', status: 'present', effectiveMinutes: 480 });

  const res = await request(app)
    .get('/attendance/range?start=2026-01-29&end=2026-02-02')
    .set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((d) => d.date), ['2026-01-30', '2026-02-02']);
});

test('GET /attendance/range requires both start and end', async () => {
  const emp = await User.create({ email: 'range-missing@x.com', displayName: 'E', role: 'employee' });
  const res = await request(app).get('/attendance/range?start=2026-09-01').set('Authorization', bearer(emp));
  assert.equal(res.status, 400);
});

test('GET /attendance/range computes live effective minutes for an in-progress (no checkout) session today', async () => {
  const emp = await User.create({ email: 'live-1@x.com', displayName: 'E', role: 'employee' });
  const today = todayStr();
  const checkIn = new Date(Date.now() - 90 * 60000); // checked in 90 minutes ago
  await Attendance.create({
    userId: emp._id, date: today, checkIn, checkOut: null,
    breakMinutes: 10, effectiveMinutes: 0, status: 'partial', punchType: 'office',
  });

  const res = await request(app)
    .get(`/attendance/range?start=${today}&end=${today}`)
    .set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  const day = res.body.find((d) => d.date === today);
  assert.ok(day.effectiveMinutes >= 75 && day.effectiveMinutes <= 85, `expected ~80, got ${day.effectiveMinutes}`);
});

test('GET /attendance/range subtracts an open break from the live effective minutes', async () => {
  const emp = await User.create({ email: 'live-2@x.com', displayName: 'E', role: 'employee' });
  const today = todayStr();
  const checkIn = new Date(Date.now() - 90 * 60000);
  const breakStart = new Date(Date.now() - 10 * 60000);
  await Attendance.create({
    userId: emp._id, date: today, checkIn, checkOut: null,
    breakMinutes: 0, breaks: [{ start: breakStart, end: null }],
    effectiveMinutes: 0, status: 'partial', punchType: 'office',
  });

  const res = await request(app)
    .get(`/attendance/range?start=${today}&end=${today}`)
    .set('Authorization', bearer(emp));
  const day = res.body.find((d) => d.date === today);
  assert.ok(day.effectiveMinutes >= 75 && day.effectiveMinutes <= 85, `expected ~80, got ${day.effectiveMinutes}`);
});

test('GET /attendance/range flags a past day with checkIn but no checkOut as needsRegularise', async () => {
  const emp = await User.create({ email: 'live-3@x.com', displayName: 'E', role: 'employee' });
  const yest = yesterdayStr();
  await Attendance.create({
    userId: emp._id, date: yest, checkIn: new Date(Date.now() - 24 * 60 * 60000),
    checkOut: null, effectiveMinutes: 0, status: 'partial', punchType: 'office',
  });

  const res = await request(app)
    .get(`/attendance/range?start=${yest}&end=${yest}`)
    .set('Authorization', bearer(emp));
  const day = res.body.find((d) => d.date === yest);
  assert.equal(day.needsRegularise, true);
});

test('GET /attendance/range leaves a completed day untouched (no live override, no needsRegularise)', async () => {
  const emp = await User.create({ email: 'live-4@x.com', displayName: 'E', role: 'employee' });
  const yest = yesterdayStr();
  await Attendance.create({
    userId: emp._id, date: yest, checkIn: new Date(Date.now() - 25 * 60 * 60000),
    checkOut: new Date(Date.now() - 16 * 60 * 60000), effectiveMinutes: 480, status: 'present', punchType: 'office',
  });

  const res = await request(app)
    .get(`/attendance/range?start=${yest}&end=${yest}`)
    .set('Authorization', bearer(emp));
  const day = res.body.find((d) => d.date === yest);
  assert.equal(day.effectiveMinutes, 480);
  assert.ok(!day.needsRegularise);
});

test('GET /attendance/month does not apply the live-elapsed override (isolated from /range)', async () => {
  const emp = await User.create({ email: 'live-5@x.com', displayName: 'E', role: 'employee' });
  const today = todayStr();
  const [y, m] = today.split('-');
  await Attendance.create({
    userId: emp._id, date: today, checkIn: new Date(Date.now() - 90 * 60000),
    checkOut: null, breakMinutes: 0, effectiveMinutes: 0, status: 'partial', punchType: 'office',
  });

  const res = await request(app)
    .get(`/attendance/month?year=${y}&month=${Number(m)}`)
    .set('Authorization', bearer(emp));
  const day = res.body.find((d) => d.date === today);
  assert.equal(day.effectiveMinutes, 0); // unmodified stored value, not live-computed
});

test('GET /attendance/stats excludes holiday dates from the absent count', async () => {
  const admin = await User.create({ email: 'hol-stats-admin@x.com', displayName: 'A', role: 'admin' });
  const emp = await User.create({ email: 'hol-stats@x.com', displayName: 'E', role: 'employee' });
  await request(app).post('/holidays')
    .set('Authorization', bearer(admin)).send({ date: '2026-10-02', name: 'Gandhi Jayanti' });
  await Attendance.create({ userId: emp._id, date: '2026-10-02', status: 'absent' });
  await Attendance.create({ userId: emp._id, date: '2026-10-03', status: 'absent' });

  const res = await request(app).get('/attendance/stats?year=2026&month=10').set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  assert.equal(res.body.absent, 1);
});

// --- Team attendance view ---

test('GET /attendance/team is scoped to the PM\'s project members', async () => {
  const pm = await User.create({ email: 'team-pm@x.com', displayName: 'PM', role: 'pm' });
  const otherPm = await User.create({ email: 'team-other-pm@x.com', displayName: 'PM2', role: 'pm' });
  const member = await User.create({ email: 'team-member@x.com', displayName: 'Member', role: 'employee' });
  const outsider = await User.create({ email: 'team-outsider@x.com', displayName: 'Outsider', role: 'employee' });

  await Project.create({ name: 'Proj A', ownerPm: pm._id, members: [member._id] });
  await Project.create({ name: 'Proj B', ownerPm: otherPm._id, members: [outsider._id] });

  await Attendance.create({
    userId: member._id, date: '2026-11-03', status: 'present',
    checkIn: new Date('2026-11-03T04:00:00Z'), checkOut: new Date('2026-11-03T13:00:00Z'),
    effectiveMinutes: 540,
  });

  const res = await request(app).get('/attendance/team?year=2026&month=11').set('Authorization', bearer(pm));
  assert.equal(res.status, 200);
  const ids = res.body.map((m) => String(m.userId));
  assert.ok(ids.includes(String(member._id)));
  assert.ok(!ids.includes(String(outsider._id)));
});

test('GET /attendance/team is forbidden for employees', async () => {
  const emp = await User.create({ email: 'team-forb@x.com', displayName: 'E', role: 'employee' });
  const res = await request(app).get('/attendance/team?year=2026&month=11').set('Authorization', bearer(emp));
  assert.equal(res.status, 403);
});

test('GET /attendance/team includes every other user for admin', async () => {
  const admin = await User.create({ email: 'team-admin@x.com', displayName: 'A', role: 'admin' });
  const someone = await User.create({ email: 'team-someone@x.com', displayName: 'S', role: 'employee' });
  const res = await request(app).get('/attendance/team?year=2026&month=11').set('Authorization', bearer(admin));
  assert.equal(res.status, 200);
  const ids = res.body.map((m) => String(m.userId));
  assert.ok(ids.includes(String(someone._id)));
});
