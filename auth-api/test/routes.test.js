import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Project } = await import('../src/models/Project.js');
const { Task } = await import('../src/models/Task.js');
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

test('employee is forbidden from admin routes', async () => {
  const emp = await User.create({ email: 'e@x.com', displayName: 'E', role: 'employee' });
  const res = await request(app).get('/admin/users').set('Authorization', bearer(emp));
  assert.equal(res.status, 403);
});

test('admin can list users', async () => {
  const admin = await User.create({ email: 'a@x.com', displayName: 'A', role: 'admin' });
  const res = await request(app).get('/admin/users').set('Authorization', bearer(admin));
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('pm cannot edit a project they do not own', async () => {
  const owner = await User.create({ email: 'pm1@x.com', displayName: 'PM1', role: 'pm' });
  const other = await User.create({ email: 'pm2@x.com', displayName: 'PM2', role: 'pm' });
  const project = await Project.create({ name: 'P', ownerPm: owner._id, members: [] });
  const res = await request(app)
    .patch(`/projects/${project._id}`)
    .set('Authorization', bearer(other))
    .send({ name: 'hacked' });
  assert.equal(res.status, 403);
});

test('employee sees only their assigned tasks via /tasks/mine', async () => {
  const emp = await User.create({ email: 'e2@x.com', displayName: 'E2', role: 'employee' });
  const res = await request(app).get('/tasks/mine').set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('PATCH /tasks/:id rejects an assignee who is not a project member', async () => {
  const pm = await User.create({ email: 'pm9@x.com', displayName: 'PM9', role: 'pm' });
  const outsider = await User.create({ email: 'out@x.com', displayName: 'Out', role: 'employee' });
  const project = await Project.create({ name: 'PJ', ownerPm: pm._id, members: [] });
  const task = await Task.create({ project: project._id, title: 'T', createdBy: pm._id });
  const res = await request(app)
    .patch(`/tasks/${task._id}`)
    .set('Authorization', bearer(pm))
    .send({ assignee: String(outsider._id) });
  assert.equal(res.status, 400);
});

test('GET /users is forbidden for employees, allowed for PM', async () => {
  const emp = await User.create({ email: 'dir-e@x.com', displayName: 'E', role: 'employee' });
  const pm = await User.create({ email: 'dir-pm@x.com', displayName: 'PM', role: 'pm' });
  const r1 = await request(app).get('/users').set('Authorization', bearer(emp));
  assert.equal(r1.status, 403);
  const r2 = await request(app).get('/users').set('Authorization', bearer(pm));
  assert.equal(r2.status, 200);
  assert.ok(Array.isArray(r2.body));
});

test('PATCH /tasks/:id/progress: assignee can set, non-assignee gets 403, value clamps', async () => {
  const pm = await User.create({ email: 'pp@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'ee@x.com', displayName: 'E', role: 'employee' });
  const other = await User.create({ email: 'oo@x.com', displayName: 'O', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', assignee: emp._id, createdBy: pm._id });
  const forbidden = await request(app).patch(`/tasks/${task._id}/progress`)
    .set('Authorization', bearer(other)).send({ percentComplete: 50 });
  assert.equal(forbidden.status, 403);
  const ok = await request(app).patch(`/tasks/${task._id}/progress`)
    .set('Authorization', bearer(emp)).send({ percentComplete: 250, status: 'in_progress' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.percentComplete, 100);
  assert.equal(ok.body.status, 'in_progress');
});

test('GET /timesheets injects assigned tasks for current week but not a past week', async () => {
  const pm = await User.create({ email: 'tpm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'temp@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  await Task.create({ project: project._id, title: 'Assigned work', assignee: emp._id, createdBy: pm._id });

  const { currentMonday } = await import('../src/services/timesheetRows.js');
  const thisMon = currentMonday();
  const cur = await request(app).get(`/timesheets/${thisMon}`).set('Authorization', bearer(emp));
  assert.equal(cur.status, 200);
  assert.equal(cur.body.tasks.some((t) => t.name === 'Assigned work' && t.locked === true), true);

  const past = await request(app).get('/timesheets/2020-01-06').set('Authorization', bearer(emp));
  assert.equal(past.status, 200);
  assert.equal(past.body.tasks.length, 0);
});

test('PUT /timesheets strips a taskId not assigned to the caller; /tasks/mine reports actualMinutes', async () => {
  const pm = await User.create({ email: 'apm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'aemp@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const mine = await Task.create({ project: project._id, title: 'Mine', assignee: emp._id, createdBy: pm._id });
  const notMine = await Task.create({ project: project._id, title: 'NotMine', assignee: pm._id, createdBy: pm._id });

  const { currentMonday } = await import('../src/services/timesheetRows.js');
  const wk = currentMonday();
  await request(app).put(`/timesheets/${wk}`).set('Authorization', bearer(emp)).send({
    tasks: [
      { id: 'r1', name: 'Mine', taskId: String(mine._id), entries: { mon: 120, tue: 0, wed: 0, thu: 0, fri: 0 } },
      { id: 'r2', name: 'Hack', taskId: String(notMine._id), entries: { mon: 60, tue: 0, wed: 0, thu: 0, fri: 0 } },
    ],
  });

  const saved = await Timesheet.findOne({ userId: emp._id, weekStart: wk });
  const hackRow = saved.tasks.find((t) => t.id === 'r2');
  assert.equal(hackRow.taskId, null);

  const res = await request(app).get('/tasks/mine').set('Authorization', bearer(emp));
  const mineRow = res.body.find((t) => t.title === 'Mine');
  assert.equal(mineRow.actualMinutes, 120);
});

test('PATCH /admin/users/:id/active: admin deactivates an employee but not themselves', async () => {
  const admin = await User.create({ email: 'aa1@x.com', displayName: 'A', role: 'admin' });
  const emp = await User.create({ email: 'ee1@x.com', displayName: 'E', role: 'employee' });
  const ok = await request(app).patch(`/admin/users/${emp._id}/active`)
    .set('Authorization', bearer(admin)).send({ active: false });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.active, false);
  const self = await request(app).patch(`/admin/users/${admin._id}/active`)
    .set('Authorization', bearer(admin)).send({ active: false });
  assert.equal(self.status, 400);
});

test('GET /users directory excludes deactivated users', async () => {
  const pm = await User.create({ email: 'dpm@x.com', displayName: 'PM', role: 'pm' });
  await User.create({ email: 'act@x.com', displayName: 'Act', role: 'employee', active: true });
  await User.create({ email: 'ina@x.com', displayName: 'Ina', role: 'employee', active: false });
  const res = await request(app).get('/users').set('Authorization', bearer(pm));
  assert.equal(res.status, 200);
  const emails = res.body.map((u) => u.email);
  assert.ok(emails.includes('act@x.com'));
  assert.ok(!emails.includes('ina@x.com'));
});

test('DELETE /admin/users/:id: blocks self and project owners, deletes others and cleans up refs', async () => {
  const admin = await User.create({ email: 'del-a@x.com', displayName: 'A', role: 'admin' });
  const pm = await User.create({ email: 'del-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'del-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', assignee: emp._id, createdBy: pm._id });

  const selfRes = await request(app).delete(`/admin/users/${admin._id}`).set('Authorization', bearer(admin));
  assert.equal(selfRes.status, 400);

  const ownerRes = await request(app).delete(`/admin/users/${pm._id}`).set('Authorization', bearer(admin));
  assert.equal(ownerRes.status, 409);

  const ok = await request(app).delete(`/admin/users/${emp._id}`).set('Authorization', bearer(admin));
  assert.equal(ok.status, 200);
  assert.equal(await User.findById(emp._id), null);
  const t = await Task.findById(task._id);
  assert.equal(t.assignee, null);
  const p = await Project.findById(project._id);
  assert.equal(p.members.some((m) => String(m) === String(emp._id)), false);
});

test('PATCH /projects/:id reassigns owner (PM/admin only) and clears the delete block', async () => {
  const admin = await User.create({ email: 'ro-a@x.com', displayName: 'A', role: 'admin' });
  const pm1 = await User.create({ email: 'ro-pm1@x.com', displayName: 'PM1', role: 'pm' });
  const pm2 = await User.create({ email: 'ro-pm2@x.com', displayName: 'PM2', role: 'pm' });
  const emp = await User.create({ email: 'ro-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm1._id, members: [] });

  // cannot reassign to an employee
  const bad = await request(app).patch(`/projects/${project._id}`)
    .set('Authorization', bearer(admin)).send({ ownerPm: String(emp._id) });
  assert.equal(bad.status, 400);

  // reassign to another PM
  const ok = await request(app).patch(`/projects/${project._id}`)
    .set('Authorization', bearer(admin)).send({ ownerPm: String(pm2._id) });
  assert.equal(ok.status, 200);
  assert.equal(String(ok.body.ownerPm), String(pm2._id));

  // pm1 no longer owns anything -> can be hard-deleted
  const del = await request(app).delete(`/admin/users/${pm1._id}`).set('Authorization', bearer(admin));
  assert.equal(del.status, 200);
});

test('DELETE /projects/:id removes the project and its tasks; non-owner PM forbidden', async () => {
  const owner = await User.create({ email: 'pd-pm@x.com', displayName: 'PM', role: 'pm' });
  const other = await User.create({ email: 'pd-pm2@x.com', displayName: 'PM2', role: 'pm' });
  const project = await Project.create({ name: 'P', ownerPm: owner._id, members: [] });
  const task = await Task.create({ project: project._id, title: 'T', createdBy: owner._id });

  const forbidden = await request(app).delete(`/projects/${project._id}`).set('Authorization', bearer(other));
  assert.equal(forbidden.status, 403);

  const ok = await request(app).delete(`/projects/${project._id}`).set('Authorization', bearer(owner));
  assert.equal(ok.status, 200);
  assert.equal(await Project.findById(project._id), null);
  assert.equal(await Task.findById(task._id), null);
});

test('refresh is rejected for a deactivated user', async () => {
  const { issueRefreshToken } = await import('../src/services/tokens.js');
  const u = await User.create({ email: 'ref@x.com', displayName: 'R', role: 'employee', active: true });
  const token = await issueRefreshToken(u);
  u.active = false;
  await u.save();
  const res = await request(app).post('/auth/refresh').set('Cookie', [`refresh_token=${token}`]);
  assert.equal(res.status, 401);
});
