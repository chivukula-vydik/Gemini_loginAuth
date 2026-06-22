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
const { Phase } = await import('../src/models/Phase.js');
const { Client } = await import('../src/models/Client.js');
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

// --- Client entity ---

test('POST /clients is pm/admin-only; GET /clients lists everything for any authed user', async () => {
  const pm = await User.create({ email: 'cli-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'cli-emp@x.com', displayName: 'E', role: 'employee' });

  const forbidden = await request(app).post('/clients').set('Authorization', bearer(emp)).send({ name: 'Acme' });
  assert.equal(forbidden.status, 403);

  const created = await request(app).post('/clients').set('Authorization', bearer(pm)).send({ name: 'Acme Corp', contactEmail: 'a@acme.com' });
  assert.equal(created.status, 201);

  const list = await request(app).get('/clients').set('Authorization', bearer(emp));
  assert.equal(list.status, 200);
  assert.ok(list.body.some((c) => c.name === 'Acme Corp'));
});

test('DELETE /clients/:id is blocked while a project references it', async () => {
  const admin = await User.create({ email: 'cli-admin@x.com', displayName: 'A', role: 'admin' });
  const client = await Client.create({ name: 'Globex' });
  await Project.create({ name: 'P', ownerPm: admin._id, clientId: client._id });

  const res = await request(app).delete(`/clients/${client._id}`).set('Authorization', bearer(admin));
  assert.equal(res.status, 409);
});

// --- Project Code ---

test('POST /projects accepts a projectCode and rejects a duplicate', async () => {
  const pm = await User.create({ email: 'code-pm@x.com', displayName: 'PM', role: 'pm' });
  const first = await request(app).post('/projects').set('Authorization', bearer(pm)).send({ name: 'P1', projectCode: 'abc-1' });
  assert.equal(first.status, 201);
  assert.equal(first.body.projectCode, 'ABC-1'); // stored uppercased

  const dup = await request(app).post('/projects').set('Authorization', bearer(pm)).send({ name: 'P2', projectCode: 'ABC-1' });
  assert.equal(dup.status, 409);
});

test('Multiple projects with no projectCode do not collide on the sparse unique index', async () => {
  const pm = await User.create({ email: 'code-none-pm@x.com', displayName: 'PM', role: 'pm' });
  const a = await request(app).post('/projects').set('Authorization', bearer(pm)).send({ name: 'NoCode A' });
  const b = await request(app).post('/projects').set('Authorization', bearer(pm)).send({ name: 'NoCode B' });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
});

// --- Billing ---

test('POST /projects accepts billing type/allowExpenses; PATCH validates the type enum', async () => {
  const pm = await User.create({ email: 'bill-pm@x.com', displayName: 'PM', role: 'pm' });
  const created = await request(app).post('/projects').set('Authorization', bearer(pm))
    .send({ name: 'Billed', billing: { type: 'fixed', allowExpenses: true } });
  assert.equal(created.status, 201);
  assert.equal(created.body.billing.type, 'fixed');
  assert.equal(created.body.billing.allowExpenses, true);

  const bad = await request(app).patch(`/projects/${created.body._id}`).set('Authorization', bearer(pm))
    .send({ billing: { type: 'nonsense' } });
  assert.equal(bad.status, 400);

  const good = await request(app).patch(`/projects/${created.body._id}`).set('Authorization', bearer(pm))
    .send({ billing: { type: 'milestone' } });
  assert.equal(good.status, 200);
  assert.equal(good.body.billing.type, 'milestone');
  assert.equal(good.body.billing.allowExpenses, true); // untouched field preserved
});

test('Task billingType defaults to billable and can be set on create/edit', async () => {
  const pm = await User.create({ email: 'tbill-pm@x.com', displayName: 'PM', role: 'pm' });
  const project = await Project.create({ name: 'TB', ownerPm: pm._id });

  const created = await request(app).post(`/projects/${project._id}/tasks`).set('Authorization', bearer(pm))
    .send({ title: 'T1' });
  assert.equal(created.body.billingType, 'billable');

  const withType = await request(app).post(`/projects/${project._id}/tasks`).set('Authorization', bearer(pm))
    .send({ title: 'T2', billingType: 'non-billable' });
  assert.equal(withType.body.billingType, 'non-billable');

  const edited = await request(app).patch(`/tasks/${created.body._id}`).set('Authorization', bearer(pm))
    .send({ billingType: 'non-billable' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.billingType, 'non-billable');

  const invalid = await request(app).patch(`/tasks/${created.body._id}`).set('Authorization', bearer(pm))
    .send({ billingType: 'free' });
  assert.equal(invalid.status, 400);
});

// --- Persistent member allocation ---

test('PATCH /projects/:id sets allocations only for existing project members and clamps allocationPct', async () => {
  const pm = await User.create({ email: 'alloc-pm@x.com', displayName: 'PM', role: 'pm' });
  const member = await User.create({ email: 'alloc-mem@x.com', displayName: 'M', role: 'employee' });
  const outsider = await User.create({ email: 'alloc-out@x.com', displayName: 'O', role: 'employee' });
  const project = await Project.create({ name: 'Alloc', ownerPm: pm._id, members: [member._id] });

  const rejected = await request(app).patch(`/projects/${project._id}`).set('Authorization', bearer(pm))
    .send({ allocations: [{ user: outsider._id, allocationPct: 50 }] });
  assert.equal(rejected.status, 400);

  const ok = await request(app).patch(`/projects/${project._id}`).set('Authorization', bearer(pm))
    .send({ allocations: [{ user: member._id, allocationPct: 10, startDate: '2026-07-01', billingRole: 'developer' }] });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.allocations[0].allocationPct, 25); // clamped to the 25 floor
  assert.equal(ok.body.allocations[0].billingRole, 'developer');
});

test('Removing a member from the project drops their allocation entry', async () => {
  const pm = await User.create({ email: 'alloc-rm-pm@x.com', displayName: 'PM', role: 'pm' });
  const member = await User.create({ email: 'alloc-rm-mem@x.com', displayName: 'M', role: 'employee' });
  const project = await Project.create({ name: 'AllocRm', ownerPm: pm._id, members: [member._id] });
  await request(app).patch(`/projects/${project._id}`).set('Authorization', bearer(pm))
    .send({ allocations: [{ user: member._id, allocationPct: 80 }] });

  const res = await request(app).patch(`/projects/${project._id}`).set('Authorization', bearer(pm))
    .send({ members: [] });
  assert.equal(res.status, 200);
  assert.equal(res.body.allocations.length, 0);
});

// --- Phases ---

test('POST /projects/:id/phases creates a phase; GET lists them sorted by order', async () => {
  const pm = await User.create({ email: 'phase-pm@x.com', displayName: 'PM', role: 'pm' });
  const project = await Project.create({ name: 'Phased', ownerPm: pm._id });

  await request(app).post(`/projects/${project._id}/phases`).set('Authorization', bearer(pm)).send({ name: 'Design', order: 2 });
  await request(app).post(`/projects/${project._id}/phases`).set('Authorization', bearer(pm)).send({ name: 'Build', order: 1 });

  const list = await request(app).get(`/projects/${project._id}/phases`).set('Authorization', bearer(pm));
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((p) => p.name), ['Build', 'Design']);
});

test('A task can be created with a phase from the same project, not another project\'s phase', async () => {
  const pm = await User.create({ email: 'phase-task-pm@x.com', displayName: 'PM', role: 'pm' });
  const projectA = await Project.create({ name: 'A', ownerPm: pm._id });
  const projectB = await Project.create({ name: 'B', ownerPm: pm._id });
  const phaseA = await Phase.create({ project: projectA._id, name: 'Kickoff' });
  const phaseB = await Phase.create({ project: projectB._id, name: 'Other' });

  const ok = await request(app).post(`/projects/${projectA._id}/tasks`).set('Authorization', bearer(pm))
    .send({ title: 'T', phase: phaseA._id });
  assert.equal(ok.status, 201);
  assert.equal(String(ok.body.phase), String(phaseA._id));

  const wrong = await request(app).post(`/projects/${projectA._id}/tasks`).set('Authorization', bearer(pm))
    .send({ title: 'T2', phase: phaseB._id });
  assert.equal(wrong.status, 400);
});

test('DELETE /projects/phases/:phaseId unsets the phase on tasks instead of leaving a dangling ref', async () => {
  const pm = await User.create({ email: 'phase-del-pm@x.com', displayName: 'PM', role: 'pm' });
  const project = await Project.create({ name: 'DelPhase', ownerPm: pm._id });
  const phase = await Phase.create({ project: project._id, name: 'Old' });
  const task = await Task.create({ project: project._id, phase: phase._id, title: 'T', createdBy: pm._id });

  const res = await request(app).delete(`/projects/phases/${phase._id}`).set('Authorization', bearer(pm));
  assert.equal(res.status, 200);

  const reloaded = await Task.findById(task._id);
  assert.equal(reloaded.phase, null);
});
