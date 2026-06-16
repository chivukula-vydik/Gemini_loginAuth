# Project Management — Slice A (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add roles (Admin/PM/Employee), an Admin-managed skill catalog, a Projects/Tasks data model, and PM task assignment to the existing auth + timesheet app — without changing the existing timesheet.

**Architecture:** Extend the `auth-api` Express/Mongoose monolith with new top-level collections (`Skill`, `Project`, `Task`) and a role claim in the JWT, guarded by a `requireRole` middleware and pure authorization helpers. Extend the React SPA with a role-aware sidebar (simple in-app view switching, no router) and CRUD screens per role.

**Tech Stack:** Node 20 ESM, Express 4, Mongoose 8, jsonwebtoken, `node:test`, `mongodb-memory-server` + `supertest` (new dev deps); React 18 + TypeScript + Vite.

**Reference spec:** `docs/superpowers/specs/2026-06-16-project-management-slice-a-design.md`

**Conventions:** All backend commands run from `auth-api/`. All frontend commands run from `web/`. `req.user` comes from the JWT and has `{ sub, email, name, role }`. Mongoose ObjectIds are compared as strings.

---

## File Structure

**Backend (`auth-api/`)**
- Create `src/models/Skill.js` — skill catalog document
- Create `src/models/Project.js` — project document
- Create `src/models/Task.js` — task document
- Modify `src/models/User.js` — add `role`, `skills`
- Create `src/services/authz.js` — pure authorization helpers (security-critical)
- Create `src/middleware/requireRole.js` — role gate
- Modify `src/services/tokens.js` — add `role` to access token
- Modify `src/routes/auth.js` — apply role bootstrap in `completeLogin`; return `role`/`skills` from `/me`
- Create `src/routes/admin.js` — `/admin/users`, `/admin/skills`
- Create `src/routes/skills.js` — `GET /skills` catalog
- Create `src/routes/profile.js` — `PATCH /me/skills`
- Create `src/routes/projects.js` — projects + nested task creation
- Create `src/routes/tasks.js` — `/tasks/mine`, `PATCH /tasks/:id`
- Modify `src/app.js` — mount new routers
- Modify `package.json` — `test` script + dev deps
- Modify `.env.example` — `ADMIN_EMAIL`
- Create `test/authz.test.js` — pure helper tests
- Create `test/routes.test.js` — route-guard integration tests

**Frontend (`web/`)**
- Create `src/pm/nav.ts` — `navForRole` helper
- Create `src/pm/nav.test.ts` — helper test
- Create `src/pm/pmApi.ts` — typed API client
- Create `src/pm/AdminUsers.tsx`, `src/pm/AdminSkills.tsx`
- Create `src/pm/Projects.tsx` (list + detail), `src/pm/MyTasks.tsx`, `src/pm/MySkills.tsx`
- Modify `src/authContext.tsx` — expose `role` on the user
- Modify `src/AppShell.tsx` — role-aware nav + view switching

---

## Task 1: Skill model

**Files:**
- Create: `auth-api/src/models/Skill.js`

- [ ] **Step 1: Create the model**

```js
import mongoose from 'mongoose';

const skillSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true },
});

skillSchema.index({ name: 1 }, { unique: true });

export const Skill = mongoose.model('Skill', skillSchema);
```

- [ ] **Step 2: Verify it imports**

Run: `cd auth-api && node -e "import('./src/models/Skill.js').then(m => console.log(typeof m.Skill))"`
Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/Skill.js
git commit -m "feat(pm): add Skill catalog model"
```

---

## Task 2: Extend User model

**Files:**
- Modify: `auth-api/src/models/User.js`

- [ ] **Step 1: Add role and skills fields**

Replace the `userSchema` definition so it reads:

```js
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  displayName: { type: String, default: '' },
  passwordHash: { type: String, default: null },
  providers: { type: [linkSchema], default: [] },
  role: { type: String, enum: ['admin', 'pm', 'employee'], default: 'employee' },
  skills: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }], default: [] },
  createdAt: { type: Date, default: Date.now },
});
```

- [ ] **Step 2: Verify it imports**

Run: `cd auth-api && node -e "import('./src/models/User.js').then(m => console.log(m.User.schema.path('role').defaultValue))"`
Expected: prints `employee`

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/User.js
git commit -m "feat(pm): add role and skills to User"
```

---

## Task 3: Project model

**Files:**
- Create: `auth-api/src/models/Project.js`

- [ ] **Step 1: Create the model**

```js
import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  ownerPm: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  startDate: { type: Date, default: null },
  targetDate: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const Project = mongoose.model('Project', projectSchema);
```

- [ ] **Step 2: Verify it imports**

Run: `cd auth-api && node -e "import('./src/models/Project.js').then(m => console.log(typeof m.Project))"`
Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/Project.js
git commit -m "feat(pm): add Project model"
```

---

## Task 4: Task model

**Files:**
- Create: `auth-api/src/models/Task.js`

> Note: this is a new `Task` model in the PM domain, distinct from the timesheet's embedded task subdocument. The timesheet `Timesheet` model is untouched.

- [ ] **Step 1: Create the model**

```js
import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  estimatedHours: { type: Number, default: 0 },
  requiredSkills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['todo', 'in_progress', 'blocked', 'done'], default: 'todo' },
  dependsOn: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  dueDate: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Task = mongoose.model('Task', taskSchema);
```

- [ ] **Step 2: Verify it imports**

Run: `cd auth-api && node -e "import('./src/models/Task.js').then(m => console.log(m.Task.schema.path('status').enumValues.join(',')))"`
Expected: prints `todo,in_progress,blocked,done`

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/Task.js
git commit -m "feat(pm): add Task model"
```

---

## Task 5: Authorization helpers (TDD)

**Files:**
- Create: `auth-api/src/services/authz.js`
- Test: `auth-api/test/authz.test.js`
- Modify: `auth-api/package.json` (add test script + dev deps)

- [ ] **Step 1: Add the test script and dev deps to package.json**

In `auth-api/package.json`, add to `"scripts"`:

```json
    "test": "node --test"
```

Then install dev deps (used here and in Task 13):

Run: `cd auth-api && npm install --save-dev mongodb-memory-server supertest`
Expected: installs without error; `package.json` gains a `devDependencies` block.

- [ ] **Step 2: Write the failing test**

Create `auth-api/test/authz.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRole, canViewProject, canEditProject, canCreateTask } from '../src/services/authz.js';

test('resolveRole: promotes the configured ADMIN_EMAIL', () => {
  const user = { email: 'boss@acme.com', role: 'employee' };
  assert.equal(resolveRole(user, { ADMIN_EMAIL: 'boss@acme.com' }), 'admin');
});

test('resolveRole: case-insensitive email match', () => {
  const user = { email: 'Boss@Acme.com', role: 'employee' };
  assert.equal(resolveRole(user, { ADMIN_EMAIL: 'boss@acme.com' }), 'admin');
});

test('resolveRole: keeps stored role when no match', () => {
  assert.equal(resolveRole({ email: 'a@b.com', role: 'pm' }, { ADMIN_EMAIL: 'boss@acme.com' }), 'pm');
  assert.equal(resolveRole({ email: 'a@b.com' }, {}), 'employee');
});

test('canViewProject: admin, owner, and members can view; others cannot', () => {
  const project = { ownerPm: 'pm1', members: ['emp1'] };
  assert.equal(canViewProject({ sub: 'x', role: 'admin' }, project), true);
  assert.equal(canViewProject({ sub: 'pm1', role: 'pm' }, project), true);
  assert.equal(canViewProject({ sub: 'emp1', role: 'employee' }, project), true);
  assert.equal(canViewProject({ sub: 'emp2', role: 'employee' }, project), false);
});

test('canEditProject: admin or owning PM only', () => {
  const project = { ownerPm: 'pm1', members: ['emp1'] };
  assert.equal(canEditProject({ sub: 'pm1', role: 'pm' }, project), true);
  assert.equal(canEditProject({ sub: 'pm2', role: 'pm' }, project), false);
  assert.equal(canEditProject({ sub: 'emp1', role: 'employee' }, project), false);
  assert.equal(canEditProject({ sub: 'x', role: 'admin' }, project), true);
});

test('canCreateTask: matches canEditProject rule', () => {
  const project = { ownerPm: 'pm1', members: [] };
  assert.equal(canCreateTask({ sub: 'pm1', role: 'pm' }, project), true);
  assert.equal(canCreateTask({ sub: 'pm2', role: 'pm' }, project), false);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd auth-api && npm test`
Expected: FAIL — cannot find module `../src/services/authz.js`.

- [ ] **Step 4: Write the implementation**

Create `auth-api/src/services/authz.js`:

```js
function userId(user) {
  return String(user.sub ?? user.id ?? user._id ?? '');
}

export function resolveRole(user, env = process.env) {
  const adminEmail = String(env.ADMIN_EMAIL || '').toLowerCase().trim();
  if (adminEmail && String(user.email || '').toLowerCase().trim() === adminEmail) return 'admin';
  return user.role || 'employee';
}

export function canViewProject(user, project) {
  if (user.role === 'admin') return true;
  const uid = userId(user);
  if (String(project.ownerPm) === uid) return true;
  return (project.members || []).some((m) => String(m) === uid);
}

export function canEditProject(user, project) {
  if (user.role === 'admin') return true;
  return user.role === 'pm' && String(project.ownerPm) === userId(user);
}

export function canCreateTask(user, project) {
  return canEditProject(user, project);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd auth-api && npm test`
Expected: PASS — all `authz` tests green.

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/services/authz.js auth-api/test/authz.test.js auth-api/package.json auth-api/package-lock.json
git commit -m "feat(pm): authorization helpers with tests"
```

---

## Task 6: requireRole middleware

**Files:**
- Create: `auth-api/src/middleware/requireRole.js`

- [ ] **Step 1: Create the middleware**

```js
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'missing token' });
    if (!allowed.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
```

- [ ] **Step 2: Verify it imports**

Run: `cd auth-api && node -e "import('./src/middleware/requireRole.js').then(m => console.log(typeof m.requireRole))"`
Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/middleware/requireRole.js
git commit -m "feat(pm): requireRole middleware"
```

---

## Task 7: Role in token + bootstrap + /me

**Files:**
- Modify: `auth-api/src/services/tokens.js`
- Modify: `auth-api/src/routes/auth.js`

- [ ] **Step 1: Add role to the access token**

In `auth-api/src/services/tokens.js`, change `signAccessToken` to include the role:

```js
export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), email: user.email, name: user.displayName, role: user.role || 'employee' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}
```

- [ ] **Step 2: Apply the bootstrap in completeLogin**

In `auth-api/src/routes/auth.js`, add the import near the top (after the existing imports):

```js
import { resolveRole } from '../services/authz.js';
```

Then change `completeLogin` to promote the configured admin before signing:

```js
export async function completeLogin(res, user) {
  const desiredRole = resolveRole(user, process.env);
  if (desiredRole !== user.role) {
    user.role = desiredRole;
    await user.save();
  }
  const refresh = await issueRefreshToken(user);
  res.cookie(COOKIE_NAME, refresh, cookieOptions());
  return signAccessToken(user);
}
```

- [ ] **Step 3: Return role and skills from /me**

In the same file, update the `/me` handler's `select` to include the new fields:

```js
  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.sub).select('email displayName providers role skills');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  }));
```

- [ ] **Step 4: Verify the app still boots**

Run: `cd auth-api && node -e "import('./src/app.js').then(m => console.log(typeof m.createApp))"`
Expected: prints `function` (no import errors).

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/services/tokens.js auth-api/src/routes/auth.js
git commit -m "feat(pm): role claim in token, admin bootstrap, expose role on /me"
```

---

## Task 8: Admin router (users + skills)

**Files:**
- Create: `auth-api/src/routes/admin.js`

- [ ] **Step 1: Create the router**

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { User } from '../models/User.js';
import { Skill } from '../models/Skill.js';

const ROLES = ['admin', 'pm', 'employee'];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createAdminRouter() {
  const router = express.Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/users', asyncHandler(async (req, res) => {
    const users = await User.find().select('email displayName role').sort('email');
    res.json(users);
  }));

  router.patch('/users/:id/role', asyncHandler(async (req, res) => {
    const { role } = req.body || {};
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'invalid role' });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true })
      .select('email displayName role');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  }));

  router.post('/skills', asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const exists = await Skill.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (exists) return res.status(409).json({ error: 'skill already exists' });
    const skill = await Skill.create({ name });
    res.status(201).json(skill);
  }));

  router.patch('/skills/:id', asyncHandler(async (req, res) => {
    const update = {};
    if (typeof req.body?.name === 'string') update.name = req.body.name.trim();
    if (typeof req.body?.active === 'boolean') update.active = req.body.active;
    const skill = await Skill.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!skill) return res.status(404).json({ error: 'not found' });
    res.json(skill);
  }));

  return router;
}
```

- [ ] **Step 2: Verify it imports**

Run: `cd auth-api && node -e "import('./src/routes/admin.js').then(m => console.log(typeof m.createAdminRouter))"`
Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/routes/admin.js
git commit -m "feat(pm): admin router for users and skill catalog"
```

---

## Task 9: Skills catalog router

**Files:**
- Create: `auth-api/src/routes/skills.js`

- [ ] **Step 1: Create the router**

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Skill } from '../models/Skill.js';

export function createSkillsRouter() {
  const router = express.Router();

  router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const skills = await Skill.find({ active: true }).sort('name');
    res.json(skills);
  }));

  return router;
}
```

- [ ] **Step 2: Verify it imports**

Run: `cd auth-api && node -e "import('./src/routes/skills.js').then(m => console.log(typeof m.createSkillsRouter))"`
Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/routes/skills.js
git commit -m "feat(pm): skills catalog read router"
```

---

## Task 10: Profile router (/me/skills)

**Files:**
- Create: `auth-api/src/routes/profile.js`

- [ ] **Step 1: Create the router**

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { User } from '../models/User.js';
import { Skill } from '../models/Skill.js';

export function createProfileRouter() {
  const router = express.Router();

  router.patch('/skills', requireAuth, asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body?.skillIds) ? req.body.skillIds : [];
    const valid = await Skill.find({ _id: { $in: ids }, active: true }).select('_id');
    const validIds = valid.map((s) => s._id);
    const user = await User.findByIdAndUpdate(req.user.sub, { skills: validIds }, { new: true })
      .select('email displayName role skills');
    res.json(user);
  }));

  return router;
}
```

- [ ] **Step 2: Verify it imports**

Run: `cd auth-api && node -e "import('./src/routes/profile.js').then(m => console.log(typeof m.createProfileRouter))"`
Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/routes/profile.js
git commit -m "feat(pm): profile router for employee skills"
```

---

## Task 11: Projects router (+ nested task creation)

**Files:**
- Create: `auth-api/src/routes/projects.js`

- [ ] **Step 1: Create the router**

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Skill } from '../models/Skill.js';
import { canViewProject, canEditProject, canCreateTask } from '../services/authz.js';

export function createProjectsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.post('/', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const { name, description, members, startDate, targetDate } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    const project = await Project.create({
      name: String(name).trim(),
      description: String(description || ''),
      ownerPm: req.user.sub,
      members: Array.isArray(members) ? members : [],
      startDate: startDate || null,
      targetDate: targetDate || null,
    });
    res.status(201).json(project);
  }));

  router.get('/', asyncHandler(async (req, res) => {
    let query;
    if (req.user.role === 'admin') query = {};
    else if (req.user.role === 'pm') query = { ownerPm: req.user.sub };
    else query = { members: req.user.sub };
    const projects = await Project.find(query).sort('-createdAt');
    res.json(projects);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const tasks = await Task.find({ project: project._id }).sort('createdAt');
    res.json({ project, tasks });
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    for (const f of ['name', 'description', 'status', 'startDate', 'targetDate']) {
      if (f in (req.body || {})) project[f] = req.body[f];
    }
    if (Array.isArray(req.body?.members)) project.members = req.body.members;
    await project.save();
    res.json(project);
  }));

  router.post('/:id/tasks', asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'not found' });
    if (!canCreateTask(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    const { title, description, estimatedHours, requiredSkills, assignee, dueDate, dependsOn } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
    if (assignee && !project.members.some((m) => String(m) === String(assignee))) {
      return res.status(400).json({ error: 'assignee must be a project member' });
    }
    const skillIds = Array.isArray(requiredSkills) ? requiredSkills : [];
    const validSkills = await Skill.find({ _id: { $in: skillIds } }).select('_id');
    const task = await Task.create({
      project: project._id,
      title: String(title).trim(),
      description: String(description || ''),
      estimatedHours: Number(estimatedHours) || 0,
      requiredSkills: validSkills.map((s) => s._id),
      assignee: assignee || null,
      dueDate: dueDate || null,
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
      createdBy: req.user.sub,
    });
    res.status(201).json(task);
  }));

  return router;
}
```

- [ ] **Step 2: Verify it imports**

Run: `cd auth-api && node -e "import('./src/routes/projects.js').then(m => console.log(typeof m.createProjectsRouter))"`
Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/routes/projects.js
git commit -m "feat(pm): projects router with nested task creation"
```

---

## Task 12: Tasks router

**Files:**
- Create: `auth-api/src/routes/tasks.js`

- [ ] **Step 1: Create the router**

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { canEditProject } from '../services/authz.js';

export function createTasksRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/mine', asyncHandler(async (req, res) => {
    const tasks = await Task.find({ assignee: req.user.sub })
      .populate('project', 'name')
      .sort('dueDate');
    res.json(tasks);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });
    for (const f of ['title', 'description', 'estimatedHours', 'assignee', 'status', 'dueDate']) {
      if (f in (req.body || {})) task[f] = req.body[f];
    }
    if (Array.isArray(req.body?.requiredSkills)) task.requiredSkills = req.body.requiredSkills;
    if (Array.isArray(req.body?.dependsOn)) task.dependsOn = req.body.dependsOn;
    await task.save();
    res.json(task);
  }));

  return router;
}
```

- [ ] **Step 2: Verify it imports**

Run: `cd auth-api && node -e "import('./src/routes/tasks.js').then(m => console.log(typeof m.createTasksRouter))"`
Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/routes/tasks.js
git commit -m "feat(pm): tasks router (mine + PM edit)"
```

---

## Task 13: Mount routers + route-guard tests (TDD)

**Files:**
- Modify: `auth-api/src/app.js`
- Modify: `auth-api/.env.example`
- Test: `auth-api/test/routes.test.js`

- [ ] **Step 1: Mount the new routers in app.js**

In `auth-api/src/app.js`, add imports after the existing route imports:

```js
import { createAdminRouter } from './routes/admin.js';
import { createSkillsRouter } from './routes/skills.js';
import { createProfileRouter } from './routes/profile.js';
import { createProjectsRouter } from './routes/projects.js';
import { createTasksRouter } from './routes/tasks.js';
```

Then mount them alongside the existing `app.use('/timesheets', ...)` line (before the error handler):

```js
  app.use('/admin', createAdminRouter());
  app.use('/skills', createSkillsRouter());
  app.use('/me', createProfileRouter());
  app.use('/projects', createProjectsRouter());
  app.use('/tasks', createTasksRouter());
```

- [ ] **Step 2: Document the env var**

In `auth-api/.env.example` (create the line if the file exists; if there is a root `.env.example`, add it there instead), add:

```
ADMIN_EMAIL=boss@example.com
```

- [ ] **Step 3: Write the failing route test**

Create `auth-api/test/routes.test.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it fails first, then passes after mounting**

Run: `cd auth-api && npm test`
Expected: the route tests PASS once Step 1 is done. (If you ran before mounting, the admin/projects/tasks requests would 404 and assertions would fail.)

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/app.js auth-api/.env.example auth-api/test/routes.test.js
git commit -m "feat(pm): mount PM routers + route-guard tests"
```

---

## Task 14: Frontend navForRole helper (TDD)

**Files:**
- Create: `web/src/pm/nav.ts`
- Test: `web/src/pm/nav.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/pm/nav.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navForRole } from './nav.ts';

test('admin nav', () => {
  assert.deepEqual(navForRole('admin').map((n) => n.key), ['users', 'skills', 'timesheet']);
});

test('pm nav', () => {
  assert.deepEqual(navForRole('pm').map((n) => n.key), ['projects', 'timesheet']);
});

test('employee nav', () => {
  assert.deepEqual(navForRole('employee').map((n) => n.key), ['my-tasks', 'my-skills', 'timesheet']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && node --test --experimental-strip-types src/pm/nav.test.ts`
Expected: FAIL — cannot find module `./nav.ts`.

- [ ] **Step 3: Write the implementation**

Create `web/src/pm/nav.ts`:

```ts
export type Role = 'admin' | 'pm' | 'employee';
export type NavKey = 'users' | 'skills' | 'projects' | 'my-tasks' | 'my-skills' | 'timesheet';
export type NavItem = { key: NavKey; label: string };

export function navForRole(role: Role): NavItem[] {
  const timesheet: NavItem = { key: 'timesheet', label: 'Timesheet' };
  if (role === 'admin') {
    return [{ key: 'users', label: 'Users' }, { key: 'skills', label: 'Skills' }, timesheet];
  }
  if (role === 'pm') {
    return [{ key: 'projects', label: 'Projects' }, timesheet];
  }
  return [{ key: 'my-tasks', label: 'My Tasks' }, { key: 'my-skills', label: 'My Skills' }, timesheet];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && node --test --experimental-strip-types src/pm/nav.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add web/src/pm/nav.ts web/src/pm/nav.test.ts
git commit -m "feat(pm): role-based nav helper with tests"
```

---

## Task 15: Expose role on the frontend user

**Files:**
- Modify: `web/src/authContext.tsx`

- [ ] **Step 1: Add role and skills to the User type**

In `web/src/authContext.tsx`, change the `User` type to include the new fields:

```ts
type User = {
  email: string;
  displayName: string;
  providers: { provider: string }[];
  role: 'admin' | 'pm' | 'employee';
  skills: string[];
};
```

(The backend `/auth/me` now returns `role` and `skills`, so no other change is needed here.)

- [ ] **Step 2: Verify the web app typechecks**

Run: `cd web && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/authContext.tsx
git commit -m "feat(pm): expose role and skills on the client user"
```

---

## Task 16: Frontend API client

**Files:**
- Create: `web/src/pm/pmApi.ts`

- [ ] **Step 1: Create the client**

```ts
import { getAccessToken } from '../api';
import type { Role } from './nav';

const API = 'http://localhost:4000';

async function authed(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data && data.error) || `request failed (${r.status})`);
  return data;
}

export type Skill = { _id: string; name: string; active: boolean };
export type UserRow = { _id: string; email: string; displayName: string; role: Role };
export type Project = {
  _id: string; name: string; description: string; ownerPm: string;
  members: string[]; status: string; startDate: string | null; targetDate: string | null;
};
export type Task = {
  _id: string; project: string | { _id: string; name: string }; title: string;
  description: string; estimatedHours: number; requiredSkills: string[];
  assignee: string | null; status: string; dueDate: string | null;
};

export const listUsers = () => authed('/admin/users') as Promise<UserRow[]>;
export const setUserRole = (id: string, role: Role) => authed(`/admin/users/${id}/role`, 'PATCH', { role });

export const listSkills = () => authed('/skills') as Promise<Skill[]>;
export const addSkill = (name: string) => authed('/admin/skills', 'POST', { name }) as Promise<Skill>;
export const updateSkill = (id: string, patch: { name?: string; active?: boolean }) =>
  authed(`/admin/skills/${id}`, 'PATCH', patch) as Promise<Skill>;
export const setMySkills = (skillIds: string[]) => authed('/me/skills', 'PATCH', { skillIds });

export const listProjects = () => authed('/projects') as Promise<Project[]>;
export const createProject = (body: Partial<Project>) => authed('/projects', 'POST', body) as Promise<Project>;
export const getProject = (id: string) =>
  authed(`/projects/${id}`) as Promise<{ project: Project; tasks: Task[] }>;
export const createTask = (projectId: string, body: Partial<Task> & { requiredSkills?: string[] }) =>
  authed(`/projects/${projectId}/tasks`, 'POST', body) as Promise<Task>;

export const myTasks = () => authed('/tasks/mine') as Promise<Task[]>;
```

- [ ] **Step 2: Verify the web app typechecks**

Run: `cd web && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/pm/pmApi.ts
git commit -m "feat(pm): typed frontend API client"
```

---

## Task 17: Admin screens (Users + Skills)

**Files:**
- Create: `web/src/pm/AdminUsers.tsx`
- Create: `web/src/pm/AdminSkills.tsx`

- [ ] **Step 1: Create AdminUsers.tsx**

```tsx
import { useEffect, useState } from 'react';
import { listUsers, setUserRole, UserRow } from './pmApi';
import type { Role } from './nav';

const ROLES: Role[] = ['admin', 'pm', 'employee'];

export function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { listUsers().then(setUsers).catch((e) => setError(e.message)); }, []);

  async function change(id: string, role: Role) {
    setError('');
    try {
      const updated = await setUserRole(id, role);
      setUsers((us) => us.map((u) => (u._id === id ? updated : u)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">Users</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">User</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td className="ts-task">{u.displayName || '—'}</td>
                <td>{u.email}</td>
                <td>
                  <select className="input" value={u.role} onChange={(e) => change(u._id, e.target.value as Role)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
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

- [ ] **Step 2: Create AdminSkills.tsx**

```tsx
import { useEffect, useState } from 'react';
import { listSkills, addSkill, updateSkill, Skill } from './pmApi';

export function AdminSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function reload() { listSkills().then(setSkills).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!name.trim()) return;
    setError('');
    try { await addSkill(name.trim()); setName(''); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function toggle(s: Skill) {
    try { await updateSkill(s._id, { active: !s.active }); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">Skills</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-nav-left" style={{ marginBottom: 16 }}>
        <input className="input" placeholder="New skill" value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-primary" onClick={add}>Add</button>
      </div>
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Skill</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {skills.map((s) => (
              <tr key={s._id}>
                <td className="ts-task">{s.name}</td>
                <td>{s.active ? 'active' : 'inactive'}</td>
                <td><button className="link-btn" onClick={() => toggle(s)}>{s.active ? 'Deactivate' : 'Activate'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Note: `GET /skills` returns only active skills, so the Admin list shows active ones; deactivated skills drop off the list after toggling. This is acceptable for Slice A.

- [ ] **Step 3: Verify the web app typechecks**

Run: `cd web && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/pm/AdminUsers.tsx web/src/pm/AdminSkills.tsx
git commit -m "feat(pm): admin users and skills screens"
```

---

## Task 18: Employee screens (My Tasks + My Skills)

**Files:**
- Create: `web/src/pm/MyTasks.tsx`
- Create: `web/src/pm/MySkills.tsx`

- [ ] **Step 1: Create MyTasks.tsx**

```tsx
import { useEffect, useState } from 'react';
import { myTasks, Task } from './pmApi';

export function MyTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { myTasks().then(setTasks).catch((e) => setError(e.message)); }, []);

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">My Tasks</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead>
            <tr><th className="ts-task">Task</th><th>Project</th><th>Est. hrs</th><th>Status</th><th>Due</th></tr>
          </thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={5} className="ts-empty">No tasks assigned to you yet.</td></tr>}
            {tasks.map((t) => (
              <tr key={t._id}>
                <td className="ts-task">{t.title}</td>
                <td>{typeof t.project === 'object' ? t.project.name : '—'}</td>
                <td>{t.estimatedHours}</td>
                <td>{t.status}</td>
                <td>{t.dueDate ? t.dueDate.slice(0, 10) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create MySkills.tsx**

```tsx
import { useEffect, useState } from 'react';
import { listSkills, setMySkills, Skill } from './pmApi';
import { useAuth } from '../authContext';

export function MySkills() {
  const { user, reload } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(user?.skills ?? []));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { listSkills().then(setSkills).catch((e) => setError(e.message)); }, []);

  function toggle(id: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    setError('');
    try {
      await setMySkills([...selected]);
      await reload();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">My Skills</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="chips" style={{ justifyContent: 'flex-start' }}>
        {skills.map((s) => (
          <button key={s._id} type="button"
            className="chip" style={{ cursor: 'pointer', opacity: selected.has(s._id) ? 1 : 0.4 }}
            onClick={() => toggle(s._id)}>
            {s.name}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={save}>Save</button>
        {saved && <span className="ts-sub" style={{ marginLeft: 10 }}>Saved.</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the web app typechecks**

Run: `cd web && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/pm/MyTasks.tsx web/src/pm/MySkills.tsx
git commit -m "feat(pm): employee my-tasks and my-skills screens"
```

---

## Task 19: PM Projects screen (list + detail)

**Files:**
- Create: `web/src/pm/Projects.tsx`

- [ ] **Step 1: Create Projects.tsx**

```tsx
import { useEffect, useState } from 'react';
import {
  listProjects, createProject, getProject, createTask,
  listSkills, Project, Task, Skill,
} from './pmApi';

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function reload() { listProjects().then(setProjects).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!name.trim()) return;
    setError('');
    try { await createProject({ name: name.trim() }); setName(''); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  if (openId) return <ProjectDetail id={openId} onBack={() => { setOpenId(null); reload(); }} />;

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">Projects</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-nav-left" style={{ marginBottom: 16 }}>
        <input className="input" placeholder="New project name" value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-primary" onClick={add}>Create</button>
      </div>
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Project</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {projects.length === 0 && <tr><td colSpan={3} className="ts-empty">No projects yet.</td></tr>}
            {projects.map((p) => (
              <tr key={p._id}>
                <td className="ts-task">{p.name}</td>
                <td>{p.status}</td>
                <td><button className="link-btn" onClick={() => setOpenId(p._id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState('');
  const [assignee, setAssignee] = useState('');
  const [reqSkills, setReqSkills] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  function reload() {
    getProject(id).then(({ project, tasks }) => { setProject(project); setTasks(tasks); })
      .catch((e) => setError(e.message));
  }
  useEffect(() => { reload(); listSkills().then(setSkills).catch(() => {}); }, [id]);

  async function add() {
    if (!title.trim()) return;
    setError('');
    try {
      await createTask(id, {
        title: title.trim(),
        estimatedHours: Number(estimate) || 0,
        assignee: assignee || null,
        requiredSkills: [...reqSkills],
      });
      setTitle(''); setEstimate(''); setAssignee(''); setReqSkills(new Set());
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  function toggleSkill(sid: string) {
    setReqSkills((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  }

  if (!project) return <div className="ts-page"><p className="center-loading">Loading…</p></div>;

  return (
    <div className="ts-page">
      <header className="ts-header">
        <button className="link-btn" onClick={onBack}>← Projects</button>
        <h1 className="ts-h1">{project.name}</h1>
      </header>
      {error && <p className="ts-error">{error}</p>}

      <div className="ts-card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="ts-nav-left" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input className="input" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" style={{ width: 110 }} placeholder="Est. hrs" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
          <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {project.members.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="btn btn-primary" onClick={add}>Add task</button>
        </div>
        <div className="chips" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
          {skills.map((s) => (
            <button key={s._id} type="button" className="chip"
              style={{ cursor: 'pointer', opacity: reqSkills.has(s._id) ? 1 : 0.4 }}
              onClick={() => toggleSkill(s._id)}>{s.name}</button>
          ))}
        </div>
      </div>

      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Task</th><th>Est. hrs</th><th>Assignee</th><th>Status</th></tr></thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={4} className="ts-empty">No tasks yet.</td></tr>}
            {tasks.map((t) => (
              <tr key={t._id}>
                <td className="ts-task">{t.title}</td>
                <td>{t.estimatedHours}</td>
                <td>{t.assignee || 'Unassigned'}</td>
                <td>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Note: the assignee dropdown and task assignee show member/user ids in Slice A (member management UI and name resolution are intentionally minimal here). Adding members and showing display names is a small follow-up; it does not block the foundation.

- [ ] **Step 2: Verify the web app typechecks**

Run: `cd web && npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/pm/Projects.tsx
git commit -m "feat(pm): PM projects list and detail with task creation"
```

---

## Task 20: Wire role-aware AppShell

**Files:**
- Modify: `web/src/AppShell.tsx`

- [ ] **Step 1: Replace AppShell with role-aware view switching**

```tsx
import { useState } from 'react';
import { useAuth } from './authContext';
import { TimesheetPage } from './timesheet/TimesheetPage';
import { navForRole, NavKey } from './pm/nav';
import { AdminUsers } from './pm/AdminUsers';
import { AdminSkills } from './pm/AdminSkills';
import { Projects } from './pm/Projects';
import { MyTasks } from './pm/MyTasks';
import { MySkills } from './pm/MySkills';

function viewFor(key: NavKey) {
  switch (key) {
    case 'users': return <AdminUsers />;
    case 'skills': return <AdminSkills />;
    case 'projects': return <Projects />;
    case 'my-tasks': return <MyTasks />;
    case 'my-skills': return <MySkills />;
    case 'timesheet': return <TimesheetPage />;
  }
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const items = navForRole(user?.role ?? 'employee');
  const [active, setActive] = useState<NavKey>(items[0].key);

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand"><span className="logo">A</span><span className="name">Auth Service</span></div>
        <nav className="shell-nav">
          {items.map((it) => (
            <a key={it.key} className={`shell-nav-item${active === it.key ? ' active' : ''}`}
              href="#" onClick={(e) => { e.preventDefault(); setActive(it.key); }}>
              {it.label}
            </a>
          ))}
        </nav>
        <div className="shell-user">
          <div className="shell-user-email">{user?.email}</div>
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="shell-content">
        {viewFor(active)}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify the web app typechecks and builds**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: typecheck exit 0; Vite build succeeds.

- [ ] **Step 3: Commit**

```bash
git add web/src/AppShell.tsx
git commit -m "feat(pm): role-aware sidebar with view switching"
```

---

## Task 21: Full verification

- [ ] **Step 1: Run the backend test suite**

Run: `cd auth-api && npm test`
Expected: all `authz` and `routes` tests PASS.

- [ ] **Step 2: Run the frontend helper test**

Run: `cd web && node --test --experimental-strip-types src/pm/nav.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 3: Frontend typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: exit 0; build succeeds.

- [ ] **Step 4: Manual smoke test (requires Mongo running)**

Start the API (`cd auth-api && npm run dev`) and web (`cd web && npm run dev`) with `ADMIN_EMAIL` set to your login email. Log in → confirm the sidebar shows **Users / Skills / Timesheet** (admin). Add a skill, promote a second account to **pm**, log in as that account → confirm **Projects / Timesheet**, create a project, add a task. Promote/keep a third as **employee** → confirm **My Tasks / My Skills / Timesheet**.

- [ ] **Step 5: Final commit (if any manual fixes were needed)**

```bash
git add -A
git commit -m "chore(pm): slice A foundation verification fixes"
```

---

## Self-Review Notes

- **Spec coverage:** roles (Tasks 2, 7), skill catalog (1, 8, 9), employee skills (10, 18), projects one-owner + members (3, 11, 19), tasks with estimate/required-skills/nullable-assignee/dependsOn (4, 11), PM assignment (11, 19), employee read-only `/tasks/mine` (12, 18), role guard + JWT role (5, 6, 7, 13), admin bootstrap via `ADMIN_EMAIL` (7, 13), role-aware UI with view switching (14, 20), timesheet untouched (verified by not modifying it). Testing: pure authz + route guards + navForRole (5, 13, 14).
- **Deferred correctly:** no `percentComplete`/hours logging, no employee status changes (PATCH /tasks is PM/Admin only), no marketplace, no dashboards/alerts.
- **Type consistency:** `navForRole`/`Role`/`NavKey` shared between `nav.ts`, `pmApi.ts`, `AppShell.tsx`; `authed()` client matches route shapes; `signAccessToken` role claim consumed by `requireRole`.
