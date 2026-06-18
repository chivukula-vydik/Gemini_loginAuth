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
const { EditRequest } = await import('../src/models/EditRequest.js');
const { ClaimRequest } = await import('../src/models/ClaimRequest.js');
const { AssignmentOffer } = await import('../src/models/AssignmentOffer.js');
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

function assignedTo(userId) {
  return [{ user: userId, sharePct: 100 }];
}

function soleAssigneeId(task) {
  return task.assignees?.[0]?.user;
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

test('PATCH /tasks/:id/assignees rejects an assignee who is not a project member', async () => {
  const pm = await User.create({ email: 'pm9@x.com', displayName: 'PM9', role: 'pm' });
  const outsider = await User.create({ email: 'out@x.com', displayName: 'Out', role: 'employee' });
  const project = await Project.create({ name: 'PJ', ownerPm: pm._id, members: [] });
  const task = await Task.create({ project: project._id, title: 'T', createdBy: pm._id });
  const res = await request(app)
    .patch(`/tasks/${task._id}/assignees`)
    .set('Authorization', bearer(pm))
    .send({ assignees: [String(outsider._id)] });
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
  const task = await Task.create({ project: project._id, title: 'T', assignees: assignedTo(emp._id), createdBy: pm._id });
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
  await Task.create({ project: project._id, title: 'Assigned work', assignees: assignedTo(emp._id), createdBy: pm._id });

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
  const mine = await Task.create({ project: project._id, title: 'Mine', assignees: assignedTo(emp._id), createdBy: pm._id });
  const notMine = await Task.create({ project: project._id, title: 'NotMine', assignees: assignedTo(pm._id), createdBy: pm._id });

  const { currentMonday } = await import('../src/services/timesheetRows.js');
  const wk = currentMonday();
  // Monday is a past/locked day unless today is Monday; approve it so the write applies.
  await EditRequest.create({ userId: emp._id, weekStart: wk, day: 'mon', projectId: project._id, status: 'approved' });
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
  const task = await Task.create({ project: project._id, title: 'T', assignees: assignedTo(emp._id), createdBy: pm._id });

  const selfRes = await request(app).delete(`/admin/users/${admin._id}`).set('Authorization', bearer(admin));
  assert.equal(selfRes.status, 400);

  const ownerRes = await request(app).delete(`/admin/users/${pm._id}`).set('Authorization', bearer(admin));
  assert.equal(ownerRes.status, 409);

  const ok = await request(app).delete(`/admin/users/${emp._id}`).set('Authorization', bearer(admin));
  assert.equal(ok.status, 200);
  assert.equal(await User.findById(emp._id), null);
  const t = await Task.findById(task._id);
  assert.deepEqual(t.assignees, []);
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

test('edit-requests: GET is forbidden for employees', async () => {
  const emp = await User.create({ email: 'er-e@x.com', displayName: 'E', role: 'employee' });
  const res = await request(app).get('/edit-requests').set('Authorization', bearer(emp));
  assert.equal(res.status, 403);
});

test('GET /edit-requests omits legacy requests that have no projectId', async () => {
  const pm = await User.create({ email: 'leg-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'leg-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  // legacy doc (old per-day model) inserted raw to bypass the now-required projectId
  await EditRequest.collection.insertOne({
    userId: emp._id, weekStart: '2020-01-06', day: 'mon', status: 'pending', reason: 'legacy', createdAt: new Date(),
  });
  await EditRequest.create({ userId: emp._id, weekStart: '2020-01-06', day: 'tue', projectId: project._id, status: 'pending', reason: 'scoped' });

  const res = await request(app).get('/edit-requests').set('Authorization', bearer(pm));
  assert.equal(res.status, 200);
  const reasons = res.body.map((r) => r.reason);
  assert.ok(reasons.includes('scoped'));
  assert.ok(!reasons.includes('legacy')); // legacy projectId-less doc filtered out
});

test('PUT /timesheets: project-scoped grant unlocks only that project and is consumed on change', async () => {
  const pm = await User.create({ email: 'ps-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'ps-e@x.com', displayName: 'E', role: 'employee' });
  const projA = await Project.create({ name: 'A', ownerPm: pm._id, members: [emp._id] });
  const projB = await Project.create({ name: 'B', ownerPm: pm._id, members: [emp._id] });
  const taskA = await Task.create({ project: projA._id, title: 'TA', assignees: assignedTo(emp._id), createdBy: pm._id });
  const taskB = await Task.create({ project: projB._id, title: 'TB', assignees: assignedTo(emp._id), createdBy: pm._id });
  const wk = '2020-01-06'; // past Monday → all days past, deterministic (todayDay is null)

  await Timesheet.create({ userId: emp._id, weekStart: wk, tasks: [
    { id: String(taskA._id), name: 'TA', taskId: taskA._id, entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } },
    { id: String(taskB._id), name: 'TB', taskId: taskB._id, entries: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 } },
  ] });
  await EditRequest.create({ userId: emp._id, weekStart: wk, day: 'mon', projectId: projA._id, status: 'approved' });

  await request(app).put(`/timesheets/${wk}`).set('Authorization', bearer(emp)).send({ tasks: [
    { id: String(taskA._id), name: 'TA', taskId: String(taskA._id), entries: { mon: 120, tue: 0, wed: 0, thu: 0, fri: 0 } },
    { id: String(taskB._id), name: 'TB', taskId: String(taskB._id), entries: { mon: 120, tue: 0, wed: 0, thu: 0, fri: 0 } },
  ] });

  const saved = await Timesheet.findOne({ userId: emp._id, weekStart: wk });
  const monA = saved.tasks.find((t) => t.id === String(taskA._id)).entries.mon;
  const monB = saved.tasks.find((t) => t.id === String(taskB._id)).entries.mon;
  assert.equal(monA, 120); // project A unlocked by grant
  assert.equal(monB, 0);   // project B stays locked
  const grant = await EditRequest.findOne({ userId: emp._id, weekStart: wk, day: 'mon', projectId: projA._id });
  assert.equal(grant.status, 'used'); // grant consumed by the change
});

test('PUT /timesheets: a no-op save leaves an approved grant approved', async () => {
  const pm = await User.create({ email: 'noop-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'noop-e@x.com', displayName: 'E', role: 'employee' });
  const projA = await Project.create({ name: 'A', ownerPm: pm._id, members: [emp._id] });
  const taskA = await Task.create({ project: projA._id, title: 'TA', assignees: assignedTo(emp._id), createdBy: pm._id });
  const wk = '2020-01-06';
  await Timesheet.create({ userId: emp._id, weekStart: wk, tasks: [
    { id: String(taskA._id), name: 'TA', taskId: taskA._id, entries: { mon: 45, tue: 0, wed: 0, thu: 0, fri: 0 } },
  ] });
  await EditRequest.create({ userId: emp._id, weekStart: wk, day: 'mon', projectId: projA._id, status: 'approved' });

  await request(app).put(`/timesheets/${wk}`).set('Authorization', bearer(emp)).send({ tasks: [
    { id: String(taskA._id), name: 'TA', taskId: String(taskA._id), entries: { mon: 45, tue: 0, wed: 0, thu: 0, fri: 0 } },
  ] });

  const grant = await EditRequest.findOne({ userId: emp._id, weekStart: wk, day: 'mon', projectId: projA._id });
  assert.equal(grant.status, 'approved'); // unchanged → not consumed
});

test('GET /timesheets returns todayDay, project-scoped grants, readOnly, and rows carry projectId', async () => {
  const { currentMonday } = await import('../src/services/timesheetRows.js');
  const pm = await User.create({ email: 'get-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'get-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', assignees: assignedTo(emp._id), createdBy: pm._id });
  const wk = currentMonday();
  await EditRequest.create({ userId: emp._id, weekStart: wk, day: 'mon', projectId: project._id, status: 'approved' });

  const res = await request(app).get(`/timesheets/${wk}`).set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  assert.ok('todayDay' in res.body); // present (a weekday or null)
  assert.equal(res.body.readOnly, false); // current week
  assert.deepEqual(res.body.grants, [{ day: 'mon', projectId: String(project._id) }]);
  const row = res.body.tasks.find((t) => t.taskId === String(task._id));
  assert.equal(row.projectId, String(project._id)); // injected row carries projectId

  await EditRequest.create({ userId: emp._id, weekStart: wk, day: 'tue', projectId: project._id, status: 'pending' });
  // re-fetch so the pending request is included
  const res2 = await request(app).get(`/timesheets/${wk}`).set('Authorization', bearer(emp));
  assert.deepEqual(res2.body.pending, [{ day: 'tue', projectId: String(project._id) }]);
});

test('POST edit-request requires a projectId the caller has a task on, and dedupes', async () => {
  const { currentMonday } = await import('../src/services/timesheetRows.js');
  const pm = await User.create({ email: 'req-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'req-e@x.com', displayName: 'E', role: 'employee' });
  const projA = await Project.create({ name: 'A', ownerPm: pm._id, members: [emp._id] });
  const projOther = await Project.create({ name: 'O', ownerPm: pm._id, members: [] });
  await Task.create({ project: projA._id, title: 'TA', assignees: assignedTo(emp._id), createdBy: pm._id });
  const wk = currentMonday();
  // a guaranteed past day: previous week's Monday
  const prevMon = new Date(`${wk}T00:00:00Z`); prevMon.setUTCDate(prevMon.getUTCDate() - 7);
  const pastWeek = prevMon.toISOString().slice(0, 10);

  const noTask = await request(app).post(`/timesheets/${pastWeek}/edit-requests`)
    .set('Authorization', bearer(emp)).send({ day: 'mon', projectId: String(projOther._id) });
  assert.equal(noTask.status, 400); // no task on that project

  const ok = await request(app).post(`/timesheets/${pastWeek}/edit-requests`)
    .set('Authorization', bearer(emp)).send({ day: 'mon', projectId: String(projA._id) });
  assert.equal(ok.status, 201);

  const dup = await request(app).post(`/timesheets/${pastWeek}/edit-requests`)
    .set('Authorization', bearer(emp)).send({ day: 'mon', projectId: String(projA._id) });
  assert.equal(dup.status, 409); // pending duplicate
});

test('PATCH /tasks/:id/estimate: assignee proposes, non-assignee 403; PM approves', async () => {
  const pm = await User.create({ email: 'est-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'est-e@x.com', displayName: 'E', role: 'employee' });
  const other = await User.create({ email: 'est-o@x.com', displayName: 'O', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', assignees: assignedTo(emp._id), createdBy: pm._id });

  const forbidden = await request(app).patch(`/tasks/${task._id}/estimate`)
    .set('Authorization', bearer(other)).send({ proposedHours: 5 });
  assert.equal(forbidden.status, 403);

  const propose = await request(app).patch(`/tasks/${task._id}/estimate`)
    .set('Authorization', bearer(emp)).send({ value: 8, unit: 'hours' });
  assert.equal(propose.status, 200);
  assert.equal(propose.body.estimateStatus, 'proposed');
  assert.equal(propose.body.proposedHours, 8);
  assert.equal(propose.body.proposedValue, 8);
  assert.equal(propose.body.proposedUnit, 'hours');

  const approve = await request(app).patch(`/tasks/${task._id}/estimate/decision`)
    .set('Authorization', bearer(pm)).send({ decision: 'approve' });
  assert.equal(approve.status, 200);
  assert.equal(approve.body.estimateStatus, 'approved');
  assert.equal(approve.body.estimatedHours, 8);
});

test('a PM who is also the assignee cannot approve their own proposed estimate', async () => {
  const pm = await User.create({ email: 'self-pm@x.com', displayName: 'PM', role: 'pm' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [pm._id] });
  const task = await Task.create({ project: project._id, title: 'T', assignees: assignedTo(pm._id), createdBy: pm._id });
  await request(app).patch(`/tasks/${task._id}/estimate`).set('Authorization', bearer(pm)).send({ value: 6, unit: 'hours' });
  const res = await request(app).patch(`/tasks/${task._id}/estimate/decision`)
    .set('Authorization', bearer(pm)).send({ decision: 'approve' });
  assert.equal(res.status, 403);
});

test('GET /marketplace returns only unassigned, member-project, skill-matched tasks', async () => {
  const pm = await User.create({ email: 'mk-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'mk-e@x.com', displayName: 'E', role: 'employee', skills: [] });
  const memberProject = await Project.create({ name: 'Mine', ownerPm: pm._id, members: [emp._id] });
  const otherProject = await Project.create({ name: 'Other', ownerPm: pm._id, members: [] });
  const open = await Task.create({ project: memberProject._id, title: 'Open', createdBy: pm._id });
  await Task.create({ project: memberProject._id, title: 'Assigned', assignees: assignedTo(pm._id), createdBy: pm._id });
  await Task.create({ project: otherProject._id, title: 'NotMember', createdBy: pm._id });

  const res = await request(app).get('/marketplace').set('Authorization', bearer(emp));
  assert.equal(res.status, 200);
  const titles = res.body.map((t) => t.title);
  assert.deepEqual(titles, ['Open']);
  assert.equal(res.body[0].myClaimStatus, 'none');

  // claim, then it shows pending
  await request(app).post(`/tasks/${open._id}/claim`).set('Authorization', bearer(emp));
  const res2 = await request(app).get('/marketplace').set('Authorization', bearer(emp));
  assert.equal(res2.body[0].myClaimStatus, 'pending');
});

test('POST /tasks/:id/claim rejects a non-member; dedupes a second pending claim', async () => {
  const pm = await User.create({ email: 'cl-pm@x.com', displayName: 'PM', role: 'pm' });
  const member = await User.create({ email: 'cl-m@x.com', displayName: 'M', role: 'employee' });
  const outsider = await User.create({ email: 'cl-o@x.com', displayName: 'O', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [member._id] });
  const task = await Task.create({ project: project._id, title: 'T', createdBy: pm._id });

  const out = await request(app).post(`/tasks/${task._id}/claim`).set('Authorization', bearer(outsider));
  assert.equal(out.status, 400);

  const first = await request(app).post(`/tasks/${task._id}/claim`).set('Authorization', bearer(member));
  assert.equal(first.status, 201);
  const dup = await request(app).post(`/tasks/${task._id}/claim`).set('Authorization', bearer(member));
  assert.equal(dup.status, 409);
});

test('claim-requests: GET 403 for employee; approve assigns task and auto-denies competitors', async () => {
  const pm = await User.create({ email: 'cd-pm@x.com', displayName: 'PM', role: 'pm' });
  const a = await User.create({ email: 'cd-a@x.com', displayName: 'A', role: 'employee' });
  const b = await User.create({ email: 'cd-b@x.com', displayName: 'B', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [a._id, b._id] });
  const task = await Task.create({ project: project._id, title: 'T', createdBy: pm._id });
  const claimA = await ClaimRequest.create({ taskId: task._id, userId: a._id });
  const claimB = await ClaimRequest.create({ taskId: task._id, userId: b._id });

  const empView = await request(app).get('/claim-requests').set('Authorization', bearer(a));
  assert.equal(empView.status, 403);

  const ok = await request(app).patch(`/claim-requests/${claimA._id}`).set('Authorization', bearer(pm)).send({ decision: 'approved' });
  assert.equal(ok.status, 200);
  const savedTask = await Task.findById(task._id);
  assert.equal(String(soleAssigneeId(savedTask)), String(a._id));
  const otherClaim = await ClaimRequest.findById(claimB._id);
  assert.equal(otherClaim.status, 'denied');
});

test('estimate propose/approve carries unit and derives hours', async () => {
  const pm = await User.create({ email: 'u-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'u-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', assignees: assignedTo(emp._id), createdBy: pm._id });

  const propose = await request(app).patch(`/tasks/${task._id}/estimate`)
    .set('Authorization', bearer(emp)).send({ value: 2, unit: 'days' });
  assert.equal(propose.status, 200);
  assert.equal(propose.body.proposedValue, 2);
  assert.equal(propose.body.proposedUnit, 'days');
  assert.equal(propose.body.proposedHours, 16);

  const approve = await request(app).patch(`/tasks/${task._id}/estimate/decision`)
    .set('Authorization', bearer(pm)).send({ decision: 'approve' });
  assert.equal(approve.status, 200);
  assert.equal(approve.body.estimateValue, 2);
  assert.equal(approve.body.estimateUnit, 'days');
  assert.equal(approve.body.estimatedHours, 16);
});

test('task create + edit accept a startDate', async () => {
  const pm = await User.create({ email: 'sd-pm@x.com', displayName: 'PM', role: 'pm' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [] });
  const created = await request(app).post(`/projects/${project._id}/tasks`)
    .set('Authorization', bearer(pm)).send({ title: 'T', startDate: '2026-06-16' });
  assert.equal(created.status, 201);
  assert.equal(String(created.body.startDate).slice(0, 10), '2026-06-16');

  const edited = await request(app).patch(`/tasks/${created.body._id}`)
    .set('Authorization', bearer(pm)).send({ startDate: '2026-06-18' });
  assert.equal(edited.status, 200);
  assert.equal(String(edited.body.startDate).slice(0, 10), '2026-06-18');
});

test('PATCH /tasks/:id/assignees assigns directly even when employee is busy (no offer)', async () => {
  const pm = await User.create({ email: 'of-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'of-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  await Task.create({ project: project._id, title: 'Busy', assignees: assignedTo(emp._id), status: 'in_progress', createdBy: pm._id });
  const second = await Task.create({ project: project._id, title: 'Second', createdBy: pm._id });

  const res = await request(app).patch(`/tasks/${second._id}/assignees`)
    .set('Authorization', bearer(pm)).send({ assignees: [String(emp._id)] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.assignees.map((a) => String(a.user)), [String(emp._id)]);
  const saved = await Task.findById(second._id);
  assert.equal(String(soleAssigneeId(saved)), String(emp._id));
  const offers = await AssignmentOffer.countDocuments({ taskId: second._id, userId: emp._id, status: 'pending' });
  assert.equal(offers, 0);
});

test('a free employee is assigned directly (no offer)', async () => {
  const pm = await User.create({ email: 'fr-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'fr-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', createdBy: pm._id });
  const res = await request(app).patch(`/tasks/${task._id}/assignees`)
    .set('Authorization', bearer(pm)).send({ assignees: [String(emp._id)] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.assignees.map((a) => String(a.user)), [String(emp._id)]);
  const saved = await Task.findById(task._id);
  assert.equal(String(soleAssigneeId(saved)), String(emp._id));
});

test('employee accepts an offer -> task assigned; another employee cannot decide it', async () => {
  const pm = await User.create({ email: 'ac-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'ac-e@x.com', displayName: 'E', role: 'employee' });
  const other = await User.create({ email: 'ac-o@x.com', displayName: 'O', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', createdBy: pm._id });
  const offer = await AssignmentOffer.create({ taskId: task._id, userId: emp._id, offeredBy: pm._id });

  const mine = await request(app).get('/assignment-offers/mine').set('Authorization', bearer(emp));
  assert.equal(mine.status, 200);
  assert.equal(mine.body.length, 1);
  assert.equal(mine.body[0].task.title, 'T');

  const forbidden = await request(app).patch(`/assignment-offers/${offer._id}`)
    .set('Authorization', bearer(other)).send({ decision: 'accept' });
  assert.equal(forbidden.status, 403);

  const ok = await request(app).patch(`/assignment-offers/${offer._id}`)
    .set('Authorization', bearer(emp)).send({ decision: 'accept' });
  assert.equal(ok.status, 200);
  const saved = await Task.findById(task._id);
  assert.equal(String(soleAssigneeId(saved)), String(emp._id));
});

test('declining an offer leaves the task unassigned', async () => {
  const pm = await User.create({ email: 'dc-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'dc-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  const task = await Task.create({ project: project._id, title: 'T', createdBy: pm._id });
  const offer = await AssignmentOffer.create({ taskId: task._id, userId: emp._id, offeredBy: pm._id });

  const res = await request(app).patch(`/assignment-offers/${offer._id}`)
    .set('Authorization', bearer(emp)).send({ decision: 'decline' });
  assert.equal(res.status, 200);
  const saved = await Task.findById(task._id);
  assert.equal(saved.assignees.length, 0);
  const updated = await AssignmentOffer.findById(offer._id);
  assert.equal(updated.status, 'declined');
});

test('re-assigning a busy employee twice does not create pending offers', async () => {
  const pm = await User.create({ email: 'dd-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'dd-e@x.com', displayName: 'E', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [emp._id] });
  await Task.create({ project: project._id, title: 'Busy', assignees: assignedTo(emp._id), status: 'in_progress', createdBy: pm._id });
  const second = await Task.create({ project: project._id, title: 'Second', createdBy: pm._id });

  await request(app).patch(`/tasks/${second._id}/assignees`).set('Authorization', bearer(pm)).send({ assignees: [String(emp._id)] });
  await request(app).patch(`/tasks/${second._id}/assignees`).set('Authorization', bearer(pm)).send({ assignees: [String(emp._id)] });

  const count = await AssignmentOffer.countDocuments({ taskId: second._id, userId: emp._id, status: 'pending' });
  assert.equal(count, 0);
});

test('re-saving assignees preserves an already-submitted estimate', async () => {
  const pm = await User.create({ email: 'me-pm@x.com', displayName: 'PM', role: 'pm' });
  const u1 = await User.create({ email: 'me-u1@x.com', displayName: 'U1', role: 'employee' });
  const u2 = await User.create({ email: 'me-u2@x.com', displayName: 'U2', role: 'employee' });
  const project = await Project.create({ name: 'P', ownerPm: pm._id, members: [u1._id, u2._id] });
  const task = await Task.create({ project: project._id, title: 'T', createdBy: pm._id });

  // PM sets assignees [u1:50, u2:50].
  const first = await request(app).patch(`/tasks/${task._id}/assignees`)
    .set('Authorization', bearer(pm))
    .send({ assignees: [{ user: String(u1._id), sharePct: 50 }, { user: String(u2._id), sharePct: 50 }] });
  assert.equal(first.status, 200);

  // u1 submits a 12h estimate directly via the model (/my-estimate not wired yet).
  await Task.updateOne(
    { _id: task._id, 'assignees.user': u1._id },
    { $set: { 'assignees.$.estimatedHours': 12 } },
  );

  // PM re-saves assignees with new shares [u1:60, u2:40].
  const second = await request(app).patch(`/tasks/${task._id}/assignees`)
    .set('Authorization', bearer(pm))
    .send({ assignees: [{ user: String(u1._id), sharePct: 60 }, { user: String(u2._id), sharePct: 40 }] });
  assert.equal(second.status, 200);

  const after = await Task.findById(task._id);
  const savedU1 = after.assignees.find((a) => String(a.user) === String(u1._id));
  const savedU2 = after.assignees.find((a) => String(a.user) === String(u2._id));
  assert.equal(savedU1.estimatedHours, 12);
  assert.equal(savedU1.sharePct, 60);
  assert.equal(savedU2.estimatedHours, null);
  assert.equal(savedU2.sharePct, 40);
  // Not all assignees have submitted estimates yet, so task.estimatedHours resets to 0.
  assert.equal(after.estimatedHours, 0);
});
