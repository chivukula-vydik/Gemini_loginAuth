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
