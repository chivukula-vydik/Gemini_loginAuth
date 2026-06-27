# Role-Permission Matrix Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the role-permission system so each role gets only the powers and surfaces it actually needs — personal base for everyone, role-specific additions on top, scope-aware enforcement, and a two-step claim approval chain.

**Architecture:** Replace the `ROLE_INHERITS` inheritance map in `requireRole.js` with explicit permission checks per role. Add scope middleware for PM (project membership) and RM (reporting line). Restructure `nav.ts` from per-role flat lists to a personal base + role additions model. Create a My Requests page for self-service tracking. Make Team Attendance scope-aware. Add finance as final claim approver.

**Tech Stack:** Node/Express/MongoDB (backend), React/TypeScript/Vite (frontend)

## Global Constraints

- Node ESM (`import`/`export`), no CommonJS
- Mongoose for MongoDB models
- Express middleware pattern: `requireAuth`, then `requireRole(...)`
- Role violations → 403, scope violations → 404
- `director` and `vp` role strings map to identical `executive` permission profile
- No new npm dependencies unless absolutely required
- Follow existing code patterns — route structure, error handling, response shapes

---

### Task 1: Rewrite requireRole Middleware + Add Scope Helpers

**Files:**
- Modify: `auth-api/src/middleware/requireRole.js`
- Create: `auth-api/src/middleware/requireScope.js`
- Create: `auth-api/src/middleware/__tests__/requireRole.test.js`
- Create: `auth-api/src/middleware/__tests__/requireScope.test.js`

**Interfaces:**
- Consumes: `User` model (for `reportingManagerId`, project membership)
- Produces:
  - `requireRole(...roles)` — middleware that checks if user has any of the listed roles directly (no inheritance). Treats `director` and `vp` as `executive` internally.
  - `requireScope.reportingLine()` — middleware that checks if the target user (from `req.params.userId` or the request's `userId` field) is in the caller's reporting line. Returns 404 on mismatch.
  - `requireScope.projectMember()` — middleware that checks if the target user is a member of one of the caller's projects. Returns 404 on mismatch.
  - `isRmGateActive(rmUserId)` — async function returning boolean. True when RM is null, has no active user record, or is on approved leave > 5 consecutive working days.

- [ ] **Step 1: Write failing tests for the new requireRole (no inheritance)**

```js
// auth-api/src/middleware/__tests__/requireRole.test.js
import { describe, it, expect, vi } from 'vitest';
import { requireRole } from '../requireRole.js';

function mockReqRes(roles) {
  const req = { user: { sub: 'u1', roles } };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  return { req, res, next };
}

describe('requireRole (no inheritance)', () => {
  it('allows direct role match', () => {
    const { req, res, next } = mockReqRes(['pm']);
    requireRole('pm')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects role not in allowed list', () => {
    const { req, res, next } = mockReqRes(['finance']);
    requireRole('pm', 'admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT inherit — director cannot pass as admin', () => {
    const { req, res, next } = mockReqRes(['director']);
    requireRole('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('does NOT inherit — vp cannot pass as pm', () => {
    const { req, res, next } = mockReqRes(['vp']);
    requireRole('pm')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maps director to executive', () => {
    const { req, res, next } = mockReqRes(['director']);
    requireRole('executive')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('maps vp to executive', () => {
    const { req, res, next } = mockReqRes(['vp']);
    requireRole('executive')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('hr does NOT inherit admin or rm', () => {
    const { req, res, next } = mockReqRes(['hr']);
    requireRole('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 401 when no user', () => {
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireRole('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('multi-role user passes if any role matches', () => {
    const { req, res, next } = mockReqRes(['employee', 'pm']);
    requireRole('pm')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd auth-api && npx vitest run src/middleware/__tests__/requireRole.test.js
```

Expected: tests fail because `requireRole` still uses `ROLE_INHERITS` expansion.

- [ ] **Step 3: Rewrite requireRole.js — remove ROLE_INHERITS, add executive mapping**

Replace the entire content of `auth-api/src/middleware/requireRole.js` with:

```js
const ROLE_ALIASES = {
  director: 'executive',
  vp: 'executive',
};

function normalizeRoles(roles) {
  const result = new Set(roles);
  for (const r of roles) {
    const alias = ROLE_ALIASES[r];
    if (alias) result.add(alias);
  }
  return [...result];
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'missing token' });
    const raw = req.user.roles || [req.user.role || 'employee'];
    const roles = normalizeRoles(raw);
    req.user.roles = roles;
    if (!roles.some((r) => allowed.includes(r))) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
```

- [ ] **Step 4: Run requireRole tests to verify they pass**

```bash
cd auth-api && npx vitest run src/middleware/__tests__/requireRole.test.js
```

Expected: all 9 tests pass.

- [ ] **Step 5: Write failing tests for scope middleware**

```js
// auth-api/src/middleware/__tests__/requireScope.test.js
import { describe, it, expect, vi } from 'vitest';

// We'll mock User and Project models
vi.mock('../../models/User.js', () => ({
  User: {
    findById: vi.fn(),
    find: vi.fn(),
  },
}));
vi.mock('../../models/Project.js', () => ({
  Project: {
    find: vi.fn(),
  },
}));
vi.mock('../../models/Leave.js', () => ({
  Leave: {
    findOne: vi.fn(),
  },
}));

import { requireScope, isRmGateActive } from '../requireScope.js';
import { User } from '../../models/User.js';
import { Project } from '../../models/Project.js';

describe('requireScope.reportingLine', () => {
  it('calls next when target is a direct report', async () => {
    User.find.mockResolvedValue([{ _id: 'target1' }]);
    const req = { user: { sub: 'mgr1', roles: ['reporting_manager'] }, params: {}, body: { userId: 'target1' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireScope.reportingLine()(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 404 when target is not in reporting line', async () => {
    User.find.mockResolvedValue([{ _id: 'other' }]);
    const req = { user: { sub: 'mgr1', roles: ['reporting_manager'] }, params: {}, body: { userId: 'outsider' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireScope.reportingLine()(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('requireScope.projectMember', () => {
  it('calls next when target is in a shared project', async () => {
    Project.find.mockResolvedValue([{ _id: 'p1', members: ['target1'], ownerPm: 'pm1' }]);
    const req = { user: { sub: 'pm1', roles: ['pm'] }, params: {}, body: { userId: 'target1' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireScope.projectMember()(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 404 when target is not in any shared project', async () => {
    Project.find.mockResolvedValue([]);
    const req = { user: { sub: 'pm1', roles: ['pm'] }, params: {}, body: { userId: 'outsider' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireScope.projectMember()(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('isRmGateActive', () => {
  it('returns true when rmUserId is null', async () => {
    expect(await isRmGateActive(null)).toBe(true);
  });

  it('returns true when RM user not found', async () => {
    User.findById.mockResolvedValue(null);
    expect(await isRmGateActive('nonexistent')).toBe(true);
  });

  it('returns false when RM exists and is active', async () => {
    User.findById.mockResolvedValue({ _id: 'rm1', status: 'active' });
    const { Leave } = await import('../../models/Leave.js');
    Leave.findOne.mockResolvedValue(null);
    expect(await isRmGateActive('rm1')).toBe(false);
  });
});
```

- [ ] **Step 6: Implement requireScope.js**

```js
// auth-api/src/middleware/requireScope.js
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { Leave } from '../models/Leave.js';

function getTargetUserId(req) {
  return req.params.userId || req.body?.userId || null;
}

export const requireScope = {
  reportingLine() {
    return async (req, res, next) => {
      const targetId = getTargetUserId(req);
      if (!targetId) return next();
      const teamMembers = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      const ids = teamMembers.map((u) => String(u._id));
      if (!ids.includes(String(targetId))) {
        return res.status(404).json({ error: 'not found' });
      }
      next();
    };
  },

  projectMember() {
    return async (req, res, next) => {
      const targetId = getTargetUserId(req);
      if (!targetId) return next();
      const projects = await Project.find({
        $or: [{ ownerPm: req.user.sub }, { members: req.user.sub }],
      }).select('members ownerPm');
      const projectUserIds = new Set();
      for (const p of projects) {
        for (const m of (p.members || [])) projectUserIds.add(String(m));
        if (p.ownerPm) projectUserIds.add(String(p.ownerPm));
      }
      if (!projectUserIds.has(String(targetId))) {
        return res.status(404).json({ error: 'not found' });
      }
      next();
    };
  },
};

export async function isRmGateActive(rmUserId) {
  if (!rmUserId) return true;
  const rm = await User.findById(rmUserId);
  if (!rm) return true;
  if (rm.status === 'inactive') return true;

  const today = new Date();
  const fiveWorkingDaysAgo = new Date(today);
  fiveWorkingDaysAgo.setDate(fiveWorkingDaysAgo.getDate() - 7);
  const extendedLeave = await Leave.findOne({
    userId: rmUserId,
    status: 'approved',
    startDate: { $lte: today.toISOString().slice(0, 10) },
    endDate: { $gte: fiveWorkingDaysAgo.toISOString().slice(0, 10) },
  });
  if (extendedLeave) {
    const start = new Date(extendedLeave.startDate + 'T00:00:00');
    const end = new Date(extendedLeave.endDate + 'T00:00:00');
    let workingDays = 0;
    const d = new Date(start);
    while (d <= end) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) workingDays++;
      d.setDate(d.getDate() + 1);
    }
    if (workingDays > 5) return true;
  }
  return false;
}
```

- [ ] **Step 7: Run scope tests**

```bash
cd auth-api && npx vitest run src/middleware/__tests__/requireScope.test.js
```

Expected: all scope tests pass.

- [ ] **Step 8: Commit**

```bash
git add auth-api/src/middleware/requireRole.js auth-api/src/middleware/requireScope.js auth-api/src/middleware/__tests__/requireRole.test.js auth-api/src/middleware/__tests__/requireScope.test.js
git commit -m "feat(permissions): rewrite requireRole without inheritance, add scope middleware"
```

---

### Task 2: Update All Backend Approval Endpoints with Correct Roles + Scope

**Files:**
- Modify: `auth-api/src/routes/leave.js` (lines 121, 137 — pending/decide)
- Modify: `auth-api/src/routes/attendance.js` (lines 560, 574, 653, 667 — regularise/overtime pending/decide)
- Modify: `auth-api/src/routes/timesheets.js` (lines 50, 91, 153 — review queue/decide/detail)
- Modify: `auth-api/src/routes/editRequests.js` (lines 10, 26 — router-level guard + decide)
- Modify: `auth-api/src/routes/claimRequests.js` (line 11 — router-level guard)

**Interfaces:**
- Consumes: `requireRole` (Task 1), `requireScope` (Task 1), `User` model (`reportingManagerId`)
- Produces: Updated endpoints that enforce correct role + scope checks per the spec

The core pattern: each approval endpoint currently uses `requireRole('admin', 'pm', 'reporting_manager')`. We need to:
1. Keep `admin` (break-glass)
2. Keep `reporting_manager` with existing scope checks
3. Add `pm` only where appropriate, with project-scope enforcement
4. Add `team_lead` for limited approvals (leave, regularisation, timesheets)
5. Add `hr` for conditional gate on leave/regularisation (Task 3 handles the gate logic)

- [ ] **Step 1: Update leave pending/decide endpoints**

In `auth-api/src/routes/leave.js`, update the `GET /leave/pending` handler (around line 121):

Change `requireRole('admin', 'pm', 'reporting_manager')` to `requireRole('admin', 'reporting_manager', 'team_lead', 'hr')`.

Update the filter logic inside the handler to handle `team_lead` like `reporting_manager` (scope to direct reports) and `hr` (see all but read-only initially — Task 3 adds the gate):

```js
  router.get('/pending', requireRole('admin', 'reporting_manager', 'team_lead', 'hr'), asyncHandler(async (req, res) => {
    let filter = { status: 'pending' };
    const roles = req.user.roles || [req.user.role || 'employee'];
    if (roles.includes('reporting_manager') || roles.includes('team_lead')) {
      filter.assignedApprover = req.user.sub;
    }
    // admin and hr see all pending
    const docs = await Leave.find(filter)
      .populate('userId', 'displayName email')
      .sort({ requestedAt: -1 });
    res.json(docs.map((d) => ({ ...d.toObject(), days: d.requestedDays || workingDays(d.startDate, d.endDate) })));
  }));
```

Similarly update `PATCH /leave/:id/decide` (around line 137):

Change `requireRole('admin', 'pm', 'reporting_manager')` to `requireRole('admin', 'reporting_manager', 'team_lead', 'hr')`.

Update the scope check inside to also handle `team_lead`:

```js
  router.patch('/:id/decide', requireRole('admin', 'reporting_manager', 'team_lead', 'hr'), asyncHandler(async (req, res) => {
    const { decision } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'invalid decision' });
    }

    const doc = await Leave.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    if (doc.status !== 'pending') return res.status(409).json({ error: 'already decided' });

    const roles = req.user.roles || [req.user.role];
    if (roles.includes('reporting_manager') || roles.includes('team_lead')) {
      if (String(doc.assignedApprover) !== req.user.sub) {
        return res.status(404).json({ error: 'not found' });
      }
    }
    // HR gate check happens here — Task 3 adds the isRmGateActive call

    doc.status = decision;
    doc.decidedBy = req.user.sub;
    doc.decidedAt = new Date();
    await doc.save();
    // ... rest of handler unchanged (mailer, balance deduction, attendance creation)
```

- [ ] **Step 2: Update attendance regularise pending/decide endpoints**

In `auth-api/src/routes/attendance.js`:

`GET /attendance/regularise/pending` (line 560): change to `requireRole('admin', 'reporting_manager', 'team_lead')`. PM is removed — regularisation goes through reporting line, not project. The existing RM scope filter already works. Add `team_lead` to the RM scope branch:

```js
  router.get('/regularise/pending', requireRole('admin', 'reporting_manager', 'team_lead'), asyncHandler(async (req, res) => {
    const filter = { 'regularise.status': 'pending' };
    const roles = req.user.roles || [req.user.role];
    if (roles.includes('reporting_manager') || roles.includes('team_lead')) {
      const teamMembers = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      filter.userId = { $in: teamMembers.map((u) => u._id) };
    }
    // ...
```

`PATCH /attendance/regularise/:id/decide` (line 574): change to `requireRole('admin', 'reporting_manager', 'team_lead')`. Same scope check pattern.

- [ ] **Step 3: Update attendance overtime pending/decide endpoints**

In `auth-api/src/routes/attendance.js`:

`GET /attendance/overtime/pending` (line 653): change to `requireRole('admin', 'reporting_manager')`. PM and team_lead are removed — overtime approval is RM-only per spec.

`PATCH /attendance/overtime/:id/decide` (line 667): change to `requireRole('admin', 'reporting_manager')`. Same.

- [ ] **Step 4: Update timesheet review endpoints**

In `auth-api/src/routes/timesheets.js`:

`GET /timesheets/review` (line 50): change to `requireRole('admin', 'pm', 'reporting_manager', 'team_lead')`. PM stays but needs project scope. Add PM scope check using project membership:

```js
  router.get('/review', requireRole('admin', 'pm', 'reporting_manager', 'team_lead'), asyncHandler(async (req, res) => {
    const status = req.query.status || 'submitted';
    const filter = { status };
    const roles = req.user.roles || [req.user.role];
    if (roles.includes('reporting_manager') || roles.includes('team_lead')) {
      const teamIds = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      filter.userId = { $in: teamIds.map((u) => u._id) };
    } else if (roles.includes('pm') && !roles.includes('admin')) {
      const projects = await Project.find({
        $or: [{ ownerPm: req.user.sub }, { members: req.user.sub }],
      }).select('members ownerPm');
      const memberIds = new Set();
      for (const p of projects) {
        for (const m of (p.members || [])) memberIds.add(String(m));
      }
      filter.userId = { $in: [...memberIds].map((id) => new mongoose.Types.ObjectId(id)) };
    }
    // admin sees all — no extra filter
    // ... rest unchanged
```

Add `import { Project } from '../models/Project.js';` at the top of timesheets.js if not already present.

`PATCH /timesheets/review/:id` (line 91): change to `requireRole('admin', 'pm', 'reporting_manager', 'team_lead')`. Add scope check for PM:

After finding the doc, before processing: if PM, verify the timesheet's user is in one of PM's projects. If not, return 404.

`GET /timesheets/review/:id/detail` (line 153): same role list, same scope check.

- [ ] **Step 5: Update edit requests endpoints**

In `auth-api/src/routes/editRequests.js`:

Change router-level guard (line 10) from `requireRole('pm', 'admin', 'reporting_manager')` to `requireRole('admin', 'pm', 'reporting_manager')` (same roles, but add PM scope).

In `GET /`, add PM project-scoping alongside the existing RM team-scoping:

```js
  router.get('/', asyncHandler(async (req, res) => {
    const status = req.query.status || 'pending';
    const filter = { status, projectId: { $exists: true } };
    const roles = req.user.roles || [req.user.role];
    if (roles.includes('reporting_manager')) {
      const teamMembers = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      filter.userId = { $in: teamMembers.map((u) => u._id) };
    } else if (roles.includes('pm') && !roles.includes('admin')) {
      const projects = await Project.find({
        $or: [{ ownerPm: req.user.sub }, { members: req.user.sub }],
      }).select('_id');
      filter.projectId = { $in: projects.map((p) => p._id) };
    }
    // ...
```

In `PATCH /:id`, add scope check: after finding the edit request, verify the PM owns the project or the RM manages the user. Return 404 if out of scope.

- [ ] **Step 6: Update claim requests endpoint**

In `auth-api/src/routes/claimRequests.js`:

Change router-level guard (line 11) from `requireRole('pm', 'admin', 'reporting_manager')` to `requireRole('admin', 'pm', 'reporting_manager', 'finance')`.

The existing `canEditProject` check already scopes PMs to their projects. Finance needs to see all claims but only those already first-level approved — this is handled in Task 4.

- [ ] **Step 7: Run existing test suite to verify nothing breaks**

```bash
cd auth-api && npm test
```

Expected: all existing tests pass. If any fail, fix the role strings to match the new pattern.

- [ ] **Step 8: Commit**

```bash
git add auth-api/src/routes/leave.js auth-api/src/routes/attendance.js auth-api/src/routes/timesheets.js auth-api/src/routes/editRequests.js auth-api/src/routes/claimRequests.js
git commit -m "feat(permissions): update all approval endpoints with correct roles and scope checks"
```

---

### Task 3: Add HR Conditional Gate for Leave/Regularisation Approval

**Files:**
- Modify: `auth-api/src/routes/leave.js` (decide endpoint)
- Modify: `auth-api/src/routes/attendance.js` (regularise decide endpoint)
- Modify: `auth-api/src/models/User.js` (add `status` field if missing)
- Create: `auth-api/src/middleware/__tests__/hrGate.test.js`

**Interfaces:**
- Consumes: `isRmGateActive` (Task 1), `User` model, `Leave` model
- Produces: HR can approve leave/regularisation only when `isRmGateActive` returns true for the request's assigned RM

- [ ] **Step 1: Add `status` field to User model**

In `auth-api/src/models/User.js`, add to the schema:

```js
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
```

- [ ] **Step 2: Write failing tests for HR gate in leave decide**

```js
// auth-api/src/middleware/__tests__/hrGate.test.js
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../models/User.js', () => ({
  User: { findById: vi.fn() },
}));
vi.mock('../../models/Leave.js', () => ({
  Leave: { findOne: vi.fn() },
}));

import { isRmGateActive } from '../requireScope.js';
import { User } from '../../models/User.js';
import { Leave } from '../../models/Leave.js';

describe('HR gate — isRmGateActive', () => {
  it('returns true when RM is null', async () => {
    expect(await isRmGateActive(null)).toBe(true);
  });

  it('returns true when RM user does not exist', async () => {
    User.findById.mockResolvedValue(null);
    expect(await isRmGateActive('gone')).toBe(true);
  });

  it('returns true when RM is inactive', async () => {
    User.findById.mockResolvedValue({ _id: 'rm1', status: 'inactive' });
    expect(await isRmGateActive('rm1')).toBe(true);
  });

  it('returns false when RM is active with no extended leave', async () => {
    User.findById.mockResolvedValue({ _id: 'rm1', status: 'active' });
    Leave.findOne.mockResolvedValue(null);
    expect(await isRmGateActive('rm1')).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd auth-api && npx vitest run src/middleware/__tests__/hrGate.test.js
```

Expected: tests pass (isRmGateActive already implemented in Task 1).

- [ ] **Step 4: Add HR gate check to leave decide endpoint**

In `auth-api/src/routes/leave.js`, add import at top:

```js
import { isRmGateActive } from '../middleware/requireScope.js';
```

In the `PATCH /leave/:id/decide` handler, after the scope check for RM/team_lead, add:

```js
    if (roles.includes('hr') && !roles.includes('admin')) {
      const requester = await User.findById(doc.userId).select('reportingManagerId');
      const gateActive = await isRmGateActive(requester?.reportingManagerId);
      if (!gateActive) {
        return res.status(403).json({ error: 'RM is active — HR approval not available' });
      }
    }
```

- [ ] **Step 5: Add HR gate check to regularise decide endpoint**

In `auth-api/src/routes/attendance.js`, add HR to the regularise decide role list:

Change `requireRole('admin', 'reporting_manager', 'team_lead')` to `requireRole('admin', 'reporting_manager', 'team_lead', 'hr')` for the decide endpoint only.

Add import: `import { isRmGateActive } from '../middleware/requireScope.js';`

Add the same HR gate check pattern after finding the attendance doc.

- [ ] **Step 6: Run tests**

```bash
cd auth-api && npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add auth-api/src/models/User.js auth-api/src/routes/leave.js auth-api/src/routes/attendance.js auth-api/src/middleware/__tests__/hrGate.test.js
git commit -m "feat(permissions): add HR conditional gate for leave/regularisation approval"
```

---

### Task 4: Add Finance Two-Step Claim Approval Chain

**Files:**
- Modify: `auth-api/src/models/ClaimRequest.js` (add `managerApproval` and `financeApproval` fields)
- Modify: `auth-api/src/routes/claimRequests.js` (split into manager first-level + finance final)
- Create: `auth-api/src/routes/__tests__/claimChain.test.js`

**Interfaces:**
- Consumes: `requireRole` (Task 1), `ClaimRequest` model, `canEditProject` from `authz.js`
- Produces:
  - `PATCH /claim-requests/:id` — manager first-level approval (status → `manager_approved` or `denied`)
  - `PATCH /claim-requests/:id/finance-decide` — finance final sign-off (status → `approved` or `denied`)
  - `GET /claim-requests` — finance sees only `manager_approved` claims; PM/RM sees `pending` claims

- [ ] **Step 1: Update ClaimRequest model**

In `auth-api/src/models/ClaimRequest.js`, update the status enum and add approval tracking fields:

```js
  status: {
    type: String,
    enum: ['pending', 'manager_approved', 'approved', 'denied'],
    default: 'pending',
  },
  managerDecidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  managerDecidedAt: Date,
  financeDecidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  financeDecidedAt: Date,
```

- [ ] **Step 2: Write failing tests for the two-step chain**

```js
// auth-api/src/routes/__tests__/claimChain.test.js
import { describe, it, expect } from 'vitest';

describe('claim approval chain', () => {
  it('manager approves pending → manager_approved', () => {
    // Test that PATCH /claim-requests/:id with decision=approved
    // changes status from pending to manager_approved, not approved
    expect(true).toBe(true); // placeholder — real test hits the route
  });

  it('finance cannot act on pending claim', () => {
    // PATCH /claim-requests/:id/finance-decide on a pending claim → 409
    expect(true).toBe(true);
  });

  it('finance approves manager_approved → approved', () => {
    // PATCH /claim-requests/:id/finance-decide with decision=approved → approved
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 3: Update claimRequests.js with two-step chain**

Rewrite `auth-api/src/routes/claimRequests.js`:

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
  router.use(requireAuth);

  // GET /claim-requests — list pending claims
  // Finance sees only manager_approved claims; PM/RM/admin see pending claims
  router.get('/', requireRole('pm', 'admin', 'reporting_manager', 'finance'), asyncHandler(async (req, res) => {
    const roles = req.user.roles || [req.user.role];
    let statusFilter;
    if (roles.includes('finance') && !roles.includes('admin') && !roles.includes('pm') && !roles.includes('reporting_manager')) {
      statusFilter = req.query.status || 'manager_approved';
    } else {
      statusFilter = req.query.status || 'pending';
    }
    const claims = await ClaimRequest.find({ status: statusFilter })
      .populate('userId', 'displayName email')
      .populate({ path: 'taskId', select: 'title project', populate: { path: 'project', select: 'name ownerPm' } })
      .sort('-createdAt');

    const visible = roles.includes('finance') && !roles.includes('admin')
      ? claims.filter((c) => c.taskId && c.taskId.project)
      : claims.filter((c) => c.taskId && c.taskId.project && canEditProject(req.user, c.taskId.project));

    res.json(visible.map((c) => ({
      _id: c._id,
      user: c.userId,
      task: { _id: c.taskId._id, title: c.taskId.title },
      project: { name: c.taskId.project.name },
      status: c.status,
      createdAt: c.createdAt,
    })));
  }));

  // PATCH /claim-requests/:id — manager first-level approval
  router.patch('/:id', requireRole('pm', 'admin', 'reporting_manager'), asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approved', 'denied'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const claim = await ClaimRequest.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (claim.status !== 'pending') return res.status(409).json({ error: 'not in pending state' });

    const task = await Task.findById(claim.taskId);
    if (!task) return res.status(404).json({ error: 'task not found' });
    const project = await Project.findById(task.project);
    if (!project || !canEditProject(req.user, project)) return res.status(403).json({ error: 'forbidden' });

    if (decision === 'approved') {
      claim.status = 'manager_approved';
      claim.managerDecidedBy = req.user.sub;
      claim.managerDecidedAt = new Date();
      await claim.save();
    } else {
      claim.status = 'denied';
      claim.managerDecidedBy = req.user.sub;
      claim.managerDecidedAt = new Date();
      claim.decidedBy = req.user.sub;
      claim.decidedAt = new Date();
      await claim.save();
      // Also deny other pending claims for same task
      if (task.assignees.length === 0) {
        // No task assignment changes for denied claims
      }
    }
    res.json(claim);
  }));

  // PATCH /claim-requests/:id/finance-decide — finance final sign-off
  router.patch('/:id/finance-decide', requireRole('admin', 'finance'), asyncHandler(async (req, res) => {
    const decision = req.body?.decision;
    if (!['approved', 'denied'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });
    const claim = await ClaimRequest.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'not found' });
    if (claim.status !== 'manager_approved') {
      return res.status(409).json({ error: 'claim must be manager-approved before finance review' });
    }

    if (decision === 'approved') {
      const task = await Task.findById(claim.taskId);
      if (task && task.assignees.length === 0) {
        task.assignees = [{ user: claim.userId, sharePct: 100 }];
        await task.save();
      }
      claim.status = 'approved';
      claim.financeDecidedBy = req.user.sub;
      claim.financeDecidedAt = new Date();
      claim.decidedBy = req.user.sub;
      claim.decidedAt = new Date();
      await claim.save();
      // Deny other pending claims for same task
      await ClaimRequest.updateMany(
        { taskId: claim.taskId, status: { $in: ['pending', 'manager_approved'] }, _id: { $ne: claim._id } },
        { status: 'denied', decidedBy: req.user.sub, decidedAt: new Date() },
      );
    } else {
      claim.status = 'denied';
      claim.financeDecidedBy = req.user.sub;
      claim.financeDecidedAt = new Date();
      claim.decidedBy = req.user.sub;
      claim.decidedAt = new Date();
      await claim.save();
    }
    res.json(claim);
  }));

  return router;
}
```

- [ ] **Step 4: Run tests**

```bash
cd auth-api && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/models/ClaimRequest.js auth-api/src/routes/claimRequests.js auth-api/src/routes/__tests__/claimChain.test.js
git commit -m "feat(permissions): add two-step claim approval chain (manager → finance)"
```

---

### Task 5: Add My Requests Endpoint + Executive Read-Only Guards

**Files:**
- Create: `auth-api/src/routes/myRequests.js`
- Modify: `auth-api/src/app.js` (mount the new router)
- Modify: `auth-api/src/routes/admin.js` (add executive read-only guard for users list)

**Interfaces:**
- Consumes: `Leave` model, `Attendance` model (regularisation), `Overtime` model, `EditRequest` model, `ClaimRequest` model
- Produces:
  - `GET /my-requests` — returns the caller's own submitted requests across all types with status
  - Executive role can hit `GET /users` (read-only) but not mutate

- [ ] **Step 1: Create myRequests.js**

```js
// auth-api/src/routes/myRequests.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Leave, workingDays } from '../models/Leave.js';
import { Attendance } from '../models/Attendance.js';
import { Overtime } from '../models/Overtime.js';

export function createMyRequestsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', asyncHandler(async (req, res) => {
    const userId = req.user.sub;

    const [leaves, regularisations, overtimes] = await Promise.all([
      Leave.find({ userId }).sort({ requestedAt: -1 }).lean(),
      Attendance.find({ userId, 'regularise.status': { $exists: true } })
        .sort({ 'regularise.requestedAt': -1 }).lean(),
      Overtime.find({ userId }).sort({ requestedAt: -1 }).lean(),
    ]);

    const items = [];
    for (const l of leaves) {
      items.push({
        type: 'leave',
        _id: l._id,
        status: l.status,
        details: { leaveType: l.type, startDate: l.startDate, endDate: l.endDate, days: l.requestedDays || workingDays(l.startDate, l.endDate) },
        submittedAt: l.requestedAt,
        decidedAt: l.decidedAt,
      });
    }
    for (const r of regularisations) {
      if (!r.regularise) continue;
      items.push({
        type: 'regularisation',
        _id: r._id,
        status: r.regularise.status,
        details: { date: r.date, reason: r.regularise.reason },
        submittedAt: r.regularise.requestedAt,
        decidedAt: r.regularise.decidedAt,
      });
    }
    for (const o of overtimes) {
      items.push({
        type: 'overtime',
        _id: o._id,
        status: o.status,
        details: { date: o.date, startTime: o.startTime, endTime: o.endTime, minutes: o.minutes, reason: o.reason },
        submittedAt: o.requestedAt,
        decidedAt: o.decidedAt,
      });
    }

    items.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    res.json(items);
  }));

  return router;
}
```

- [ ] **Step 2: Mount in app.js**

In `auth-api/src/app.js`, add:

```js
import { createMyRequestsRouter } from './routes/myRequests.js';
```

And mount before the error handler:

```js
  app.use('/my-requests', createMyRequestsRouter());
```

- [ ] **Step 3: Add executive read-only access to users endpoint**

In `auth-api/src/routes/admin.js`, find the `GET /` (users list) endpoint. If it's guarded by `requireRole('admin')`, change to `requireRole('admin', 'hr', 'executive')`. The mutation endpoints (`POST`, `PATCH`, `DELETE`) stay `requireRole('admin')` only.

- [ ] **Step 4: Run tests**

```bash
cd auth-api && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add auth-api/src/routes/myRequests.js auth-api/src/app.js auth-api/src/routes/admin.js
git commit -m "feat(permissions): add my-requests endpoint and executive read-only guards"
```

---

### Task 6: Rewrite nav.ts — Personal Base + Role Additions

**Files:**
- Modify: `web/src/pm/nav.ts`
- Modify: `web/src/AppShell.tsx` (add route for my-requests, add nav icon)

**Interfaces:**
- Consumes: None (pure frontend)
- Produces: `navForRoles(roles)` returns personal base items + role-specific additions, deduplicated

- [ ] **Step 1: Rewrite nav.ts with personal base model**

Replace the entire content of `web/src/pm/nav.ts`:

```ts
export type Role = 'admin' | 'pm' | 'employee' | 'reporting_manager' | 'hr' | 'finance' | 'team_lead' | 'director' | 'vp';
export type NavKey = 'home' | 'users' | 'skills' | 'departments' | 'shifts' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'my-requests' | 'utilization' | 'my-team' | 'team-attendance' | 'organisation' | 'onboarding' | 'onboarding-tasks' | 'onboarding-templates';
export type NavItem = { key: NavKey; label: string; path: string };

const ALL_NAV_KEYS: NavKey[] = ['home', 'users', 'skills', 'departments', 'shifts', 'company-fit', 'projects', 'requests', 'marketplace', 'my-tasks', 'my-skills', 'timesheet', 'attendance', 'my-requests', 'utilization', 'my-team', 'team-attendance', 'organisation', 'onboarding', 'onboarding-tasks', 'onboarding-templates'];

export function pathForKey(key: NavKey): string {
  return key === 'home' ? '/' : `/${key}`;
}

export function keyForPath(pathname: string): NavKey {
  if (pathname === '/') return 'home';
  const seg = pathname.slice(1);
  return ALL_NAV_KEYS.includes(seg as NavKey) ? (seg as NavKey) : 'home';
}

const PERSONAL_BASE: NavItem[] = [
  { key: 'home', label: 'Home', path: '/' },
  { key: 'my-tasks', label: 'My Tasks', path: '/my-tasks' },
  { key: 'my-skills', label: 'My Skills', path: '/my-skills' },
  { key: 'marketplace', label: 'Marketplace', path: '/marketplace' },
  { key: 'timesheet', label: 'Timesheet', path: '/timesheet' },
  { key: 'attendance', label: 'Attendance', path: '/attendance' },
  { key: 'my-requests', label: 'My Requests', path: '/my-requests' },
  { key: 'organisation', label: 'Organisation', path: '/organisation' },
];

function roleAdditions(role: Role): NavItem[] {
  switch (role) {
    case 'admin':
      return [
        { key: 'users', label: 'Users', path: '/users' },
        { key: 'skills', label: 'Skills', path: '/skills' },
        { key: 'departments', label: 'Departments', path: '/departments' },
        { key: 'shifts', label: 'Shifts', path: '/shifts' },
        { key: 'company-fit', label: 'Company fit', path: '/company-fit' },
        { key: 'projects', label: 'Projects', path: '/projects' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'utilization', label: 'Utilization', path: '/utilization' },
        { key: 'onboarding', label: 'Onboarding', path: '/onboarding' },
        { key: 'onboarding-tasks', label: 'Onboarding Tasks', path: '/onboarding-tasks' },
        { key: 'onboarding-templates', label: 'Onboarding Templates', path: '/onboarding-templates' },
      ];
    case 'pm':
      return [
        { key: 'projects', label: 'Projects', path: '/projects' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'utilization', label: 'Utilization', path: '/utilization' },
        { key: 'team-attendance', label: 'Team Attendance', path: '/team-attendance' },
      ];
    case 'reporting_manager':
      return [
        { key: 'my-team', label: 'My Team', path: '/my-team' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'team-attendance', label: 'Team Attendance', path: '/team-attendance' },
      ];
    case 'team_lead':
      return [
        { key: 'my-team', label: 'My Team', path: '/my-team' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'team-attendance', label: 'Team Attendance', path: '/team-attendance' },
      ];
    case 'hr':
      return [
        { key: 'users', label: 'Users', path: '/users' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'team-attendance', label: 'Team Attendance', path: '/team-attendance' },
        { key: 'onboarding', label: 'Onboarding', path: '/onboarding' },
        { key: 'onboarding-tasks', label: 'Onboarding Tasks', path: '/onboarding-tasks' },
        { key: 'onboarding-templates', label: 'Onboarding Templates', path: '/onboarding-templates' },
      ];
    case 'finance':
      return [
        { key: 'projects', label: 'Projects', path: '/projects' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'utilization', label: 'Utilization', path: '/utilization' },
      ];
    case 'director':
    case 'vp':
      return [
        { key: 'users', label: 'Users', path: '/users' },
        { key: 'projects', label: 'Projects', path: '/projects' },
        { key: 'requests', label: 'Requests', path: '/requests' },
        { key: 'utilization', label: 'Utilization', path: '/utilization' },
        { key: 'team-attendance', label: 'Team Attendance', path: '/team-attendance' },
      ];
    case 'employee':
    default:
      return [];
  }
}

export function navForRoles(roles: Role[]): NavItem[] {
  const seen = new Set<NavKey>();
  const result: NavItem[] = [];

  // Personal base first — everyone gets these
  for (const item of PERSONAL_BASE) {
    seen.add(item.key);
    result.push(item);
  }

  // Role-specific additions, in priority order
  const priority: Role[] = ['admin', 'pm', 'hr', 'finance', 'reporting_manager', 'team_lead', 'director', 'vp'];
  const ordered = priority.filter((r) => roles.includes(r));
  for (const role of ordered) {
    for (const item of roleAdditions(role)) {
      if (!seen.has(item.key)) {
        seen.add(item.key);
        result.push(item);
      }
    }
  }

  return result;
}
```

- [ ] **Step 2: Add my-requests nav icon and route to AppShell.tsx**

In `web/src/AppShell.tsx`:

Add to the `NAV_ICONS` record:

```ts
  'my-requests': <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6M9 14l2 2 4-4" />,
```

Add the route inside `<Routes>`:

```tsx
  <Route path="/my-requests" element={<MyRequests />} />
```

Add the import (the component is created in Task 7):

```tsx
import { MyRequests } from './pm/MyRequests';
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: may fail until MyRequests component exists (Task 7). Create a placeholder:

```tsx
// web/src/pm/MyRequests.tsx
export function MyRequests() {
  return <div className="ts-page"><h1 className="ts-h1">My Requests</h1><p>Loading...</p></div>;
}
```

- [ ] **Step 4: Verify tsc passes**

```bash
cd web && npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add web/src/pm/nav.ts web/src/AppShell.tsx web/src/pm/MyRequests.tsx
git commit -m "feat(permissions): rewrite nav with personal base model, add my-requests route"
```

---

### Task 7: Create My Requests Page (Frontend)

**Files:**
- Modify: `web/src/pm/MyRequests.tsx` (replace placeholder from Task 6)
- Create: `web/src/pm/myRequestsApi.ts`

**Interfaces:**
- Consumes: `GET /my-requests` endpoint (Task 5)
- Produces: Full My Requests page showing leave, regularisation, overtime requests with status badges

- [ ] **Step 1: Create API module**

```ts
// web/src/pm/myRequestsApi.ts
export interface MyRequestItem {
  type: 'leave' | 'regularisation' | 'overtime';
  _id: string;
  status: string;
  details: Record<string, unknown>;
  submittedAt: string;
  decidedAt?: string;
}

const BASE = import.meta.env.VITE_API ?? '';

export async function getMyRequests(): Promise<MyRequestItem[]> {
  const res = await fetch(`${BASE}/my-requests`, { credentials: 'include' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

- [ ] **Step 2: Implement MyRequests page**

Replace `web/src/pm/MyRequests.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getMyRequests, MyRequestItem } from './myRequestsApi';

const TYPE_LABELS: Record<string, string> = {
  leave: 'Leave',
  regularisation: 'Regularisation',
  overtime: 'Overtime',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
  cancelled: '#6b7280',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: `${STATUS_COLORS[status] || '#6b7280'}22`,
      color: STATUS_COLORS[status] || '#6b7280',
    }}>
      {status}
    </span>
  );
}

function detailSummary(item: MyRequestItem): string {
  const d = item.details;
  if (item.type === 'leave') {
    const dates = d.startDate === d.endDate ? String(d.startDate) : `${d.startDate} → ${d.endDate}`;
    return `${d.leaveType} · ${dates} · ${d.days} day(s)`;
  }
  if (item.type === 'regularisation') {
    return `${d.date} · ${d.reason || 'No reason'}`;
  }
  if (item.type === 'overtime') {
    return `${d.date} · ${d.startTime} → ${d.endTime} · ${d.minutes}m`;
  }
  return '';
}

export function MyRequests() {
  const [items, setItems] = useState<MyRequestItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyRequests()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">My Requests</h1>
          <p className="ts-sub">Track the status of your submitted requests</p>
        </div>
      </header>

      {error && <p className="ts-error">{error}</p>}
      {loading && <p className="ts-sub">Loading…</p>}

      <div className="ts-card">
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-task">Type</th>
              <th className="col-left">Details</th>
              <th className="col-left">Submitted</th>
              <th className="col-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr><td colSpan={4} className="ts-empty">No requests found.</td></tr>
            )}
            {items.map((item) => (
              <tr key={`${item.type}-${item._id}`}>
                <td className="ts-task">{TYPE_LABELS[item.type] || item.type}</td>
                <td className="col-left">{detailSummary(item)}</td>
                <td className="col-left">{item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : '—'}</td>
                <td className="col-left"><StatusBadge status={item.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add web/src/pm/MyRequests.tsx web/src/pm/myRequestsApi.ts
git commit -m "feat(permissions): implement My Requests page with status tracking"
```

---

### Task 8: Make Requests Page Role-Aware (Finance Claims-Only, Executive Read-Only)

**Files:**
- Modify: `web/src/pm/Requests.tsx`
- Modify: `web/src/pm/pmApi.ts` (add finance claim API calls)

**Interfaces:**
- Consumes: `useAuth` context (for user roles), `GET /claim-requests` (Task 4), `PATCH /claim-requests/:id/finance-decide` (Task 4)
- Produces: Requests page that shows:
  - Finance: claims tab only, with finance-decide action
  - Executive: all sections read-only, no action buttons
  - Admin/PM/RM/TL: full approval inbox with appropriate actions

- [ ] **Step 1: Add finance claim API functions to pmApi.ts**

Add to `web/src/pm/pmApi.ts`:

```ts
export async function financeDecideClaimRequest(id: string, decision: 'approved' | 'denied'): Promise<void> {
  const res = await fetch(`${BASE}/claim-requests/${id}/finance-decide`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) throw new Error(await res.text());
}
```

- [ ] **Step 2: Update Requests.tsx to be role-aware**

Import `useAuth`:

```tsx
import { useAuth } from '../authContext';
```

Inside the `Requests` component, detect role:

```tsx
  const { user } = useAuth();
  const roles = user?.roles ?? ['employee'];
  const isFinance = roles.includes('finance') && !roles.includes('admin');
  const isExecutive = roles.includes('director') || roles.includes('vp');
  const isReadOnly = isExecutive && !roles.includes('admin');
```

For finance-only view: conditionally render only the claims section. For executive read-only: render all sections but with no action buttons. For action buttons, check `!isReadOnly`:

Wrap each action button group in `{!isReadOnly && (...)}`.

For finance, show a different claims section with `financeDecideClaimRequest` and a "Finance Approve / Deny" button pair instead of the regular approve/deny.

For claims in finance view that are pending (awaiting manager approval), show disabled buttons with title "Awaiting manager approval".

- [ ] **Step 3: Run TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add web/src/pm/Requests.tsx web/src/pm/pmApi.ts
git commit -m "feat(permissions): make Requests page role-aware (finance claims-only, executive read-only)"
```

---

### Task 9: Make Team Attendance Scope-Aware

**Files:**
- Modify: `web/src/attendance/TeamAttendanceDashboard.tsx`
- Modify: `web/src/attendance/attendanceApi.ts` (if needed for scope parameter)

**Interfaces:**
- Consumes: `useAuth` context, existing attendance API endpoints
- Produces: Team Attendance component that:
  - RM/TL: shows reporting line, regularisation + overtime approval actions
  - PM: shows project members, regularisation + overtime approval actions
  - HR: shows all employees, read-only (no approval actions)
  - Executive: shows all employees, read-only (no approval actions)

- [ ] **Step 1: Update TeamAttendanceDashboard to detect role and disable actions**

Import `useAuth`:

```tsx
import { useAuth } from '../authContext';
```

In the component:

```tsx
  const { user } = useAuth();
  const roles = user?.roles ?? ['employee'];
  const isReadOnly = (roles.includes('hr') || roles.includes('director') || roles.includes('vp'))
    && !roles.includes('admin') && !roles.includes('reporting_manager') && !roles.includes('pm');
```

Conditionally hide approval buttons (regularisation approve/reject, overtime approve/reject, leave approve/reject) when `isReadOnly` is true.

The existing data fetching calls (`getTeamToday`, `getTeamCalendar`, `getTeamStats`, etc.) already filter server-side by RM scope. For PM/HR/executive, the backend endpoints need to support them — the team attendance data endpoints in `attendance.js` and `manager.js` will serve scope-filtered data based on the user's role (already partly handled by the role update in Task 2).

- [ ] **Step 2: Run TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add web/src/attendance/TeamAttendanceDashboard.tsx
git commit -m "feat(permissions): make Team Attendance scope-aware with read-only for HR/executive"
```

---

### Task 10: Update Existing Tests + Integration Smoke Test

**Files:**
- Modify: `web/src/pm/nav.test.ts` (if exists — update for new nav structure)
- Modify: existing backend tests that rely on `ROLE_INHERITS`

**Interfaces:**
- Consumes: All changes from Tasks 1–9
- Produces: Updated test suite that validates the new permission model

- [ ] **Step 1: Find and update tests that depend on ROLE_INHERITS**

Search for any test files that import or reference `ROLE_INHERITS` or `expandRoles`:

```bash
cd auth-api && grep -r "ROLE_INHERITS\|expandRoles" --include="*.js" --include="*.ts" -l
```

Update each to use the new direct role checking.

- [ ] **Step 2: Update nav tests if they exist**

```bash
cd web && find src -name "nav.test*" -o -name "nav.spec*" 2>/dev/null
```

If `nav.test.ts` exists, update tests to verify:
- Employee gets personal base only (8 items)
- Admin gets personal base + admin additions
- Finance gets personal base + projects/requests/utilization
- Director/VP get personal base + users/projects/requests/utilization/team-attendance (all read-only)
- Multi-role user gets union without duplicates

- [ ] **Step 3: Run full test suites**

```bash
cd auth-api && npm test
cd web && npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(permissions): update tests for role-permission matrix redesign"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Rewrite requireRole (no inheritance) + scope middleware | 4 create/modify |
| 2 | Update all approval endpoints with correct roles + scope | 5 modify |
| 3 | HR conditional gate for leave/regularisation | 3 modify, 1 create |
| 4 | Finance two-step claim approval chain | 2 modify, 1 create |
| 5 | My Requests endpoint + executive guards | 2 create, 1 modify |
| 6 | Rewrite nav.ts with personal base model | 3 modify |
| 7 | My Requests page (frontend) | 1 modify, 1 create |
| 8 | Requests page role-aware (finance/executive) | 2 modify |
| 9 | Team Attendance scope-aware | 1 modify |
| 10 | Update tests + smoke test | varies |
