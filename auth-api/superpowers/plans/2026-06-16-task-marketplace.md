# Task Marketplace (Slice C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let employees discover unassigned, skill-matched tasks in their projects and claim them; the owning PM approves a claim (assigning the task and auto-denying competitors).

**Architecture:** Extend `auth-api` with a `ClaimRequest` model, a pure `skillsMatch` helper, a marketplace listing route, a claim endpoint, and a PM/admin claim-decision router. Extend the React SPA with an employee Marketplace screen and a "Task claims" section in the existing Requests view.

**Tech Stack:** Node 20 ESM, Express 4, Mongoose 8, `node:test` + `mongodb-memory-server` + `supertest`; React 18 + TS + Vite.

**Reference spec:** `docs/superpowers/specs/2026-06-16-task-marketplace-design.md`

**Conventions:** Backend from `auth-api/`; frontend from `web/`. `req.user` = `{ sub, email, name, role }`. ObjectIds compared as strings. Test runner: `cd auth-api && npm test`.

---

## File Structure

**Backend**
- Create `src/models/ClaimRequest.js`
- Create `src/services/match.js` — `skillsMatch`
- Create `src/routes/marketplace.js` — `GET /marketplace`
- Create `src/routes/claimRequests.js` — list + decide
- Modify `src/routes/tasks.js` — `POST /:id/claim`
- Modify `src/app.js` — mount both routers
- Modify `test/match.test.js` (new), `test/routes.test.js`

**Frontend**
- Modify `src/pm/nav.ts` + `src/pm/nav.test.ts` — employee `marketplace`
- Modify `src/AppShell.tsx` — route `marketplace`
- Modify `src/pm/pmApi.ts` — endpoints/types
- Create `src/pm/Marketplace.tsx`
- Modify `src/pm/Requests.tsx` — Task claims section

---

## Task 1: ClaimRequest model

**Files:** Create `auth-api/src/models/ClaimRequest.js`

- [ ] **Step 1: Create the model**
```js
import mongoose from 'mongoose';

const claimRequestSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

claimRequestSchema.index({ taskId: 1, status: 1 });
claimRequestSchema.index({ userId: 1 });

export const ClaimRequest = mongoose.model('ClaimRequest', claimRequestSchema);
```

- [ ] **Step 2: Verify import**

Run: `cd auth-api && node -e "import('./src/models/ClaimRequest.js').then(m => console.log(typeof m.ClaimRequest))"`
Expected: prints `function`

- [ ] **Step 3: Commit**
```bash
git add auth-api/src/models/ClaimRequest.js
git commit -m "feat(pm): ClaimRequest model"
```

---

## Task 2: skillsMatch helper (TDD)

**Files:** Create `auth-api/src/services/match.js`, `auth-api/test/match.test.js`

- [ ] **Step 1: Write the failing test**

Create `auth-api/test/match.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillsMatch } from '../src/services/match.js';

test('skillsMatch: no required skills means open to everyone', () => {
  assert.equal(skillsMatch([], ['a', 'b']), true);
  assert.equal(skillsMatch([], []), true);
});

test('skillsMatch: overlap returns true', () => {
  assert.equal(skillsMatch(['a', 'c'], ['c', 'd']), true);
});

test('skillsMatch: disjoint returns false', () => {
  assert.equal(skillsMatch(['a', 'b'], ['c', 'd']), false);
  assert.equal(skillsMatch(['a'], []), false);
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cd auth-api && npm test`
Expected: FAIL — module `../src/services/match.js` not found.

- [ ] **Step 3: Implement**

Create `auth-api/src/services/match.js`:
```js
export function skillsMatch(requiredSkillIds, userSkillIds) {
  const required = (requiredSkillIds || []).map(String);
  if (required.length === 0) return true;
  const have = new Set((userSkillIds || []).map(String));
  return required.some((id) => have.has(id));
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `cd auth-api && npm test`
Expected: PASS — 3 match tests green.

- [ ] **Step 5: Commit**
```bash
git add auth-api/src/services/match.js auth-api/test/match.test.js
git commit -m "feat(pm): skillsMatch helper with tests"
```

---

## Task 3: Marketplace router + mount

**Files:** Create `auth-api/src/routes/marketplace.js`; Modify `auth-api/src/app.js`

- [ ] **Step 1: Create the router**
```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { ClaimRequest } from '../models/ClaimRequest.js';
import { skillsMatch } from '../services/match.js';

export function createMarketplaceRouter() {
  const router = express.Router();

  router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const me = await User.findById(req.user.sub).select('skills');
    const mySkills = (me?.skills || []).map(String);
    const projects = await Project.find({ members: req.user.sub }).select('_id name');
    const projNameById = new Map(projects.map((p) => [String(p._id), p.name]));
    const tasks = await Task.find({
      project: { $in: projects.map((p) => p._id) },
      assignee: null,
      status: { $ne: 'done' },
    }).populate('requiredSkills', 'name').sort('-createdAt');

    const matched = tasks.filter((t) => skillsMatch(t.requiredSkills.map((s) => s._id), mySkills));

    const myPending = await ClaimRequest.find({
      userId: req.user.sub, status: 'pending', taskId: { $in: matched.map((t) => t._id) },
    }).select('taskId');
    const pendingSet = new Set(myPending.map((c) => String(c.taskId)));

    res.json(matched.map((t) => ({
      _id: t._id,
      title: t.title,
      project: projNameById.get(String(t.project)) || '',
      requiredSkills: t.requiredSkills.map((s) => s.name),
      estimatedHours: t.estimatedHours,
      myClaimStatus: pendingSet.has(String(t._id)) ? 'pending' : 'none',
    })));
  }));

  return router;
}
```

- [ ] **Step 2: Mount in app.js**

In `auth-api/src/app.js`, add the import with the other route imports:
```js
import { createMarketplaceRouter } from './routes/marketplace.js';
```
And add the mount next to the others (before the error handler):
```js
  app.use('/marketplace', createMarketplaceRouter());
```

- [ ] **Step 3: Verify app boots**

Run: `cd auth-api && node -e "import('./src/app.js').then(m => console.log(typeof m.createApp))"`
Expected: prints `function`

- [ ] **Step 4: Commit**
```bash
git add auth-api/src/routes/marketplace.js auth-api/src/app.js
git commit -m "feat(pm): marketplace listing route (skill-matched, member projects)"
```

---

## Task 4: Claim endpoint

**Files:** Modify `auth-api/src/routes/tasks.js`

- [ ] **Step 1: Add imports**

In `auth-api/src/routes/tasks.js`, add these imports (alongside the existing ones):
```js
import { User } from '../models/User.js';
import { ClaimRequest } from '../models/ClaimRequest.js';
import { skillsMatch } from '../services/match.js';
```

- [ ] **Step 2: Add the claim route**

After the existing `router.get('/mine', ...)` handler, add:
```js
  router.post('/:id/claim', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    if (task.assignee || task.status === 'done') return res.status(400).json({ error: 'task is not claimable' });
    const project = await Project.findById(task.project);
    if (!project || !project.members.some((m) => String(m) === String(req.user.sub))) {
      return res.status(400).json({ error: 'you are not a member of this project' });
    }
    const me = await User.findById(req.user.sub).select('skills');
    if (!skillsMatch(task.requiredSkills, me?.skills || [])) {
      return res.status(400).json({ error: 'your skills do not match this task' });
    }
    const existing = await ClaimRequest.findOne({ taskId: task._id, userId: req.user.sub, status: 'pending' });
    if (existing) return res.status(409).json({ error: 'you already have a pending claim on this task' });
    const claim = await ClaimRequest.create({ taskId: task._id, userId: req.user.sub });
    res.status(201).json(claim);
  }));
```

- [ ] **Step 3: Verify import + suite**

Run: `cd auth-api && node -e "import('./src/routes/tasks.js').then(m => console.log(typeof m.createTasksRouter))" && npm test`
Expected: prints `function`; existing tests pass.

- [ ] **Step 4: Commit**
```bash
git add auth-api/src/routes/tasks.js
git commit -m "feat(pm): claim endpoint creates a pending claim request"
```

---

## Task 5: Claim-requests router (list + decide) + mount

**Files:** Create `auth-api/src/routes/claimRequests.js`; Modify `auth-api/src/app.js`

- [ ] **Step 1: Create the router**
```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { ClaimRequest } from '../models/ClaimRequest.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { canEditProject } from '../services/authz.js';

export function createClaimRequestsRouter() {
  const router = express.Router();
  router.use(requireAuth, requireRole('pm', 'admin'));

  router.get('/', asyncHandler(async (req, res) => {
    const status = req.query.status || 'pending';
    const claims = await ClaimRequest.find({ status })
      .populate('userId', 'displayName email')
      .populate({ path: 'taskId', select: 'title project', populate: { path: 'project', select: 'name ownerPm' } })
      .sort('-createdAt');
    const visible = claims.filter((c) => c.taskId && c.taskId.project && canEditProject(req.user, c.taskId.project));
    res.json(visible.map((c) => ({
      _id: c._id,
      user: c.userId,
      task: { _id: c.taskId._id, title: c.taskId.title },
      project: { name: c.taskId.project.name },
      status: c.status,
      createdAt: c.createdAt,
    })));
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approved', 'denied'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const claim = await ClaimRequest.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    const task = await Task.findById(claim.taskId);
    if (!task) return res.status(404).json({ error: 'task not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });

    if (decision === 'approved') {
      if (task.assignee) return res.status(409).json({ error: 'task already assigned' });
      task.assignee = claim.userId;
      await task.save();
      claim.status = 'approved';
      claim.decidedBy = req.user.sub;
      claim.decidedAt = new Date();
      await claim.save();
      await ClaimRequest.updateMany(
        { taskId: task._id, status: 'pending', _id: { $ne: claim._id } },
        { status: 'denied', decidedBy: req.user.sub, decidedAt: new Date() },
      );
    } else {
      claim.status = 'denied';
      claim.decidedBy = req.user.sub;
      claim.decidedAt = new Date();
      await claim.save();
    }
    res.json(claim);
  }));

  return router;
}
```

- [ ] **Step 2: Mount in app.js**

In `auth-api/src/app.js`, add the import and mount:
```js
import { createClaimRequestsRouter } from './routes/claimRequests.js';
```
```js
  app.use('/claim-requests', createClaimRequestsRouter());
```

- [ ] **Step 3: Verify app boots**

Run: `cd auth-api && node -e "import('./src/app.js').then(m => console.log(typeof m.createApp))"`
Expected: prints `function`

- [ ] **Step 4: Commit**
```bash
git add auth-api/src/routes/claimRequests.js auth-api/src/app.js
git commit -m "feat(pm): claim-requests list/decide router with auto-deny on approve"
```

---

## Task 6: Backend route tests

**Files:** Modify `auth-api/test/routes.test.js`

- [ ] **Step 1: Add tests**

Ensure `ClaimRequest` is imported at the top of `auth-api/test/routes.test.js`:
```js
const { ClaimRequest } = await import('../src/models/ClaimRequest.js');
```
Append these tests at the end:
```js
test('GET /marketplace returns only unassigned, member-project, skill-matched tasks', async () => {
  const pm = await User.create({ email: 'mk-pm@x.com', displayName: 'PM', role: 'pm' });
  const emp = await User.create({ email: 'mk-e@x.com', displayName: 'E', role: 'employee', skills: [] });
  const memberProject = await Project.create({ name: 'Mine', ownerPm: pm._id, members: [emp._id] });
  const otherProject = await Project.create({ name: 'Other', ownerPm: pm._id, members: [] });
  const open = await Task.create({ project: memberProject._id, title: 'Open', createdBy: pm._id });
  await Task.create({ project: memberProject._id, title: 'Assigned', assignee: pm._id, createdBy: pm._id });
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
  assert.equal(String(savedTask.assignee), String(a._id));
  const otherClaim = await ClaimRequest.findById(claimB._id);
  assert.equal(otherClaim.status, 'denied');
});
```

- [ ] **Step 2: Run the suite**

Run: `cd auth-api && npm test`
Expected: PASS — prior tests plus these 3.

- [ ] **Step 3: Commit**
```bash
git add auth-api/test/routes.test.js
git commit -m "test(pm): marketplace, claim, and claim-decision route tests"
```

---

## Task 7: Frontend nav + view routing

**Files:** Modify `web/src/pm/nav.ts`, `web/src/pm/nav.test.ts`, `web/src/AppShell.tsx`

- [ ] **Step 1: Add `marketplace` to employee nav**

In `web/src/pm/nav.ts`:
- Add `'marketplace'` to `NavKey`:
```ts
export type NavKey = 'users' | 'skills' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet';
```
- Change the employee return to:
```ts
  return [
    { key: 'my-tasks', label: 'My Tasks' },
    { key: 'my-skills', label: 'My Skills' },
    { key: 'marketplace', label: 'Marketplace' },
    timesheet,
  ];
```

- [ ] **Step 2: Update the nav test**

In `web/src/pm/nav.test.ts`, change the employee assertion:
```ts
  assert.deepEqual(navForRole('employee').map((n) => n.key), ['my-tasks', 'my-skills', 'marketplace', 'timesheet']);
```

- [ ] **Step 3: Route the view**

In `web/src/AppShell.tsx` add `import { Marketplace } from './pm/Marketplace';` and the switch case `case 'marketplace': return <Marketplace />;`.

- [ ] **Step 4: Run nav test**

Run: `cd web && node --test --experimental-strip-types src/pm/nav.test.ts`
Expected: 3 pass. (`tsc` fails until Task 9 creates `Marketplace.tsx` — commit after Task 9.)

- [ ] **Step 5: Commit**
```bash
git add web/src/pm/nav.ts web/src/pm/nav.test.ts web/src/AppShell.tsx
git commit -m "feat(pm): marketplace nav + view routing"
```

---

## Task 8: Frontend API client

**Files:** Modify `web/src/pm/pmApi.ts`

- [ ] **Step 1: Add types and endpoints**

In `web/src/pm/pmApi.ts`, add near the other type exports:
```ts
export type MarketTask = {
  _id: string; title: string; project: string; requiredSkills: string[];
  estimatedHours: number; myClaimStatus: 'none' | 'pending';
};
export type ClaimReq = {
  _id: string; user: Person; task: { _id: string; title: string }; project: { name: string };
  status: string; createdAt: string;
};
```
And near the other endpoint exports:
```ts
export const listMarketplace = () => authed('/marketplace') as Promise<MarketTask[]>;
export const claimTask = (id: string) => authed(`/tasks/${id}/claim`, 'POST');
export const listClaimRequests = () => authed('/claim-requests?status=pending') as Promise<ClaimReq[]>;
export const decideClaimRequest = (id: string, decision: 'approved' | 'denied') =>
  authed(`/claim-requests/${id}`, 'PATCH', { decision });
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**
```bash
git add web/src/pm/pmApi.ts
git commit -m "feat(pm): marketplace + claim-request client endpoints"
```

---

## Task 9: Marketplace screen

**Files:** Create `web/src/pm/Marketplace.tsx`

- [ ] **Step 1: Create the component**
```tsx
import { useEffect, useState } from 'react';
import { listMarketplace, claimTask, MarketTask } from './pmApi';

export function Marketplace() {
  const [tasks, setTasks] = useState<MarketTask[]>([]);
  const [error, setError] = useState('');

  function reload() { listMarketplace().then(setTasks).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function claim(id: string) {
    setError('');
    try { await claimTask(id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header">
        <h1 className="ts-h1">Marketplace</h1>
        <p className="ts-sub">Unassigned tasks in your projects that match your skills. Claim one to request it.</p>
      </header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Task</th><th>Project</th><th>Skills</th><th>Estimate</th><th></th></tr></thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={5} className="ts-empty">No matching tasks available right now.</td></tr>}
            {tasks.map((t) => (
              <tr key={t._id}>
                <td className="ts-task">{t.title}</td>
                <td>{t.project}</td>
                <td>{t.requiredSkills.length ? t.requiredSkills.join(', ') : '—'}</td>
                <td>{t.estimatedHours}h</td>
                <td>
                  {t.myClaimStatus === 'pending'
                    ? <span className="ts-sub">Claim pending</span>
                    : <button className="link-btn" onClick={() => claim(t._id)}>Claim</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 3: Commit**
```bash
git add web/src/pm/Marketplace.tsx
git commit -m "feat(pm): employee Marketplace screen with claim"
```

---

## Task 10: Task-claims section in Requests view

**Files:** Modify `web/src/pm/Requests.tsx`

- [ ] **Step 1: Add the claims section**

Replace the contents of `web/src/pm/Requests.tsx` with:
```tsx
import { useEffect, useState } from 'react';
import {
  listEditRequests, decideEditRequest, EditReq,
  listClaimRequests, decideClaimRequest, ClaimReq,
} from './pmApi';

const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' };

export function Requests() {
  const [reqs, setReqs] = useState<EditReq[]>([]);
  const [claims, setClaims] = useState<ClaimReq[]>([]);
  const [error, setError] = useState('');

  function reload() {
    listEditRequests().then(setReqs).catch((e) => setError(e.message));
    listClaimRequests().then(setClaims).catch((e) => setError(e.message));
  }
  useEffect(() => { reload(); }, []);

  async function decideEdit(id: string, decision: 'approved' | 'denied') {
    setError('');
    try { await decideEditRequest(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function decideClaim(id: string, decision: 'approved' | 'denied') {
    setError('');
    try { await decideClaimRequest(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">Requests</h1></header>
      {error && <p className="ts-error">{error}</p>}

      <h2 className="ts-sub" style={{ fontWeight: 700, fontSize: 15, margin: '8px 0' }}>Timesheet edit requests</h2>
      <div className="ts-card" style={{ marginBottom: 22 }}>
        <table className="ts-table">
          <thead><tr><th className="ts-task">Employee</th><th>Week</th><th>Day</th><th>Reason</th><th></th></tr></thead>
          <tbody>
            {reqs.length === 0 && <tr><td colSpan={5} className="ts-empty">No pending edit requests.</td></tr>}
            {reqs.map((r) => (
              <tr key={r._id}>
                <td className="ts-task">{r.userId?.displayName || r.userId?.email || '—'}</td>
                <td>{r.weekStart}</td>
                <td>{DAY_LABEL[r.day] || r.day}</td>
                <td>{r.reason || '—'}</td>
                <td>
                  <div className="ts-nav-left">
                    <button className="link-btn" onClick={() => decideEdit(r._id, 'approved')}>Approve</button>
                    <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decideEdit(r._id, 'denied')}>Deny</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="ts-sub" style={{ fontWeight: 700, fontSize: 15, margin: '8px 0' }}>Task claims</h2>
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Employee</th><th>Task</th><th>Project</th><th></th></tr></thead>
          <tbody>
            {claims.length === 0 && <tr><td colSpan={4} className="ts-empty">No pending claims.</td></tr>}
            {claims.map((c) => (
              <tr key={c._id}>
                <td className="ts-task">{c.user?.displayName || c.user?.email || '—'}</td>
                <td>{c.task?.title}</td>
                <td>{c.project?.name}</td>
                <td>
                  <div className="ts-nav-left">
                    <button className="link-btn" onClick={() => decideClaim(c._id, 'approved')}>Approve</button>
                    <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decideClaim(c._id, 'denied')}>Deny</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 3: Commit**
```bash
git add web/src/pm/Requests.tsx
git commit -m "feat(pm): task-claim approvals in the Requests view"
```

---

## Task 11: Full verification

- [ ] **Step 1: Backend**

Run: `cd auth-api && npm test`
Expected: all tests pass (incl. match + new route tests).

- [ ] **Step 2: Frontend**

Run: `cd web && node --test --experimental-strip-types "src/**/*.test.ts" && npx tsc --noEmit && npm run build`
Expected: tests pass; tsc 0; build OK.

- [ ] **Step 3: Manual smoke (Mongo + ADMIN_EMAIL)**

As an admin, add a skill and give an employee that skill (My Skills). As a PM, create a project with that employee as a member and an **unassigned** task requiring that skill. As the employee → **Marketplace** shows the task → **Claim**. As the PM → **Requests → Task claims** → Approve. Confirm the task now appears in the employee's **My Tasks** (assigned).

- [ ] **Step 4: Final commit (if fixes needed)**
```bash
git add -A && git commit -m "chore(pm): marketplace verification fixes"
```

---

## Self-Review Notes

- **Spec coverage:** ClaimRequest (Task 1); `skillsMatch` (2); marketplace list filtered by member-project + skill match + myClaimStatus (3, 6); claim with member/match/dedupe guards (4, 6); claim list/decide with owner auth, assign-on-approve, auto-deny competitors, already-assigned 409 (5, 6); employee Marketplace nav/screen (7, 9); claims in Requests view (10); migration-free (new collection only).
- **Type consistency:** `MarketTask`/`ClaimReq` shapes match the marketplace/claim-request route responses; `skillsMatch(required, user)` arg order consistent across `match.js`, marketplace route, and claim route; `decideClaimRequest` uses `'approved'|'denied'` matching the backend enum.
- **Deferred:** org-wide discovery, dashboards, dependency alerts.
