import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { OnboardingCase } = await import('../src/models/OnboardingCase.js');
const { OnboardingTask } = await import('../src/models/OnboardingTask.js');
const { signAccessToken } = await import('../src/services/tokens.js');

let mongod, app;

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

describe('GET /onboarding — taskProgress', () => {
  test('includes taskProgress on each case', async () => {
    const hr = await User.create({ email: 'ob-tp1@x.com', displayName: 'HR1', roles: ['hr'] });
    const c = await OnboardingCase.create({
      candidate: { firstName: 'A', lastName: 'B', personalEmail: 'ab@x.com' },
      joiningDate: new Date(),
      createdBy: hr._id,
    });
    await OnboardingTask.create({ onboardingCase: c._id, title: 'T1', status: 'done' });
    await OnboardingTask.create({ onboardingCase: c._id, title: 'T2', status: 'pending' });
    await OnboardingTask.create({ onboardingCase: c._id, title: 'T3', status: 'pending' });

    const res = await request(app)
      .get('/onboarding')
      .set('Authorization', bearer(hr));
    assert.equal(res.status, 200);
    const found = res.body.find(item => String(item._id) === String(c._id));
    assert.ok(found.taskProgress);
    assert.equal(found.taskProgress.done, 1);
    assert.equal(found.taskProgress.total, 3);
  });

  test('case with no tasks gets { done: 0, total: 0 }', async () => {
    const hr = await User.create({ email: 'ob-tp2@x.com', displayName: 'HR2', roles: ['hr'] });
    const c = await OnboardingCase.create({
      candidate: { firstName: 'C', lastName: 'D', personalEmail: 'cd@x.com' },
      joiningDate: new Date(),
      createdBy: hr._id,
    });

    const res = await request(app)
      .get('/onboarding')
      .set('Authorization', bearer(hr));
    assert.equal(res.status, 200);
    const found = res.body.find(item => String(item._id) === String(c._id));
    assert.deepEqual(found.taskProgress, { done: 0, total: 0 });
  });
});

describe('GET /onboarding/stats', () => {
  test('returns all zeros when no data', async () => {
    const hr = await User.create({ email: 'ob-st1@x.com', displayName: 'HRS1', roles: ['hr'] });
    await OnboardingCase.deleteMany({});
    await OnboardingTask.deleteMany({});

    const res = await request(app)
      .get('/onboarding/stats')
      .set('Authorization', bearer(hr));
    assert.equal(res.status, 200);
    assert.equal(res.body.activeCases, 0);
    assert.equal(res.body.joiningSoon, 0);
    assert.equal(res.body.overdueTasks, 0);
    assert.equal(res.body.completedThisQuarter, 0);
  });

  test('returns correct counts with mixed data', async () => {
    const hr = await User.create({ email: 'ob-st2@x.com', displayName: 'HRS2', roles: ['hr'] });
    await OnboardingCase.deleteMany({});
    await OnboardingTask.deleteMany({});

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 40);

    await OnboardingCase.create({ candidate: { firstName: 'X1', lastName: 'Y', personalEmail: 'x1@x.com' }, joiningDate: tomorrow, status: 'PRE_BOARDING', createdBy: hr._id });
    await OnboardingCase.create({ candidate: { firstName: 'X2', lastName: 'Y', personalEmail: 'x2@x.com' }, joiningDate: nextMonth, status: 'OFFER_SENT', createdBy: hr._id });
    await OnboardingCase.create({ candidate: { firstName: 'X3', lastName: 'Y', personalEmail: 'x3@x.com' }, joiningDate: new Date(), status: 'CONFIRMED', confirmedAt: new Date(), createdBy: hr._id });
    await OnboardingCase.create({ candidate: { firstName: 'X4', lastName: 'Y', personalEmail: 'x4@x.com' }, joiningDate: new Date(), status: 'CANCELLED', createdBy: hr._id });

    const res = await request(app)
      .get('/onboarding/stats')
      .set('Authorization', bearer(hr));
    assert.equal(res.body.activeCases, 2);
    assert.equal(res.body.joiningSoon, 1);
    assert.equal(res.body.completedThisQuarter, 1);
  });

  test('overdue count only includes tasks past dueDate', async () => {
    const hr = await User.create({ email: 'ob-st3@x.com', displayName: 'HRS3', roles: ['hr'] });
    await OnboardingCase.deleteMany({});
    await OnboardingTask.deleteMany({});

    const c = await OnboardingCase.create({ candidate: { firstName: 'Z', lastName: 'W', personalEmail: 'zw@x.com' }, joiningDate: new Date(), status: 'INDUCTION', createdBy: hr._id });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    await OnboardingTask.create({ onboardingCase: c._id, title: 'Overdue', status: 'pending', dueDate: yesterday });
    await OnboardingTask.create({ onboardingCase: c._id, title: 'Future', status: 'pending', dueDate: nextWeek });
    await OnboardingTask.create({ onboardingCase: c._id, title: 'Done', status: 'done', dueDate: yesterday });

    const res = await request(app)
      .get('/onboarding/stats')
      .set('Authorization', bearer(hr));
    assert.equal(res.body.overdueTasks, 1);
  });

  test('403 for employee', async () => {
    const emp = await User.create({ email: 'ob-st4@x.com', displayName: 'EMP', roles: ['employee'] });
    const res = await request(app)
      .get('/onboarding/stats')
      .set('Authorization', bearer(emp));
    assert.equal(res.status, 403);
  });
});
