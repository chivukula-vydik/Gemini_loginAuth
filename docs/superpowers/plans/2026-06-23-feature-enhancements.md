# Feature Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client/billing fields to projects, a Reporting Manager role, leave workflow routing to RM, billable hour tracking in timesheets with utilization reports, and a URL tracking API.

**Architecture:** Five incremental phases, each producing testable functionality. Backend changes use Mongoose models + Express routes. Frontend changes use React 19 + TypeScript. Each phase is committed independently.

**Tech Stack:** Node.js, Express, Mongoose (MongoDB), React 19, TypeScript, Vite

## Global Constraints

- MongoDB via Mongoose — no raw driver calls
- Express routes follow the factory-function pattern (`export function createXRouter()`)
- Frontend API calls go through `web/src/fetchHelper.ts` (`authed()`) or inline `fetch` with `authHeaders()`
- Roles are enforced via `requireRole(...roles)` middleware
- All dates stored as `YYYY-MM-DD` strings (not Date objects) where the existing codebase does so
- No new npm dependencies unless absolutely necessary

---

### Task 1: Add Client & Billing Fields to Project Model

**Files:**
- Modify: `auth-api/src/models/Project.js`

**Interfaces:**
- Produces: Project model with fields `clientName`, `billingType`, `billingRate`, `currency` available to all route handlers that import `Project`

- [ ] **Step 1: Add fields to Project schema**

In `auth-api/src/models/Project.js`, add these fields to `projectSchema` after the `targetDate` field:

```js
clientName:  { type: String, default: '', trim: true },
billingType: { type: String, enum: ['billable', 'non-billable'], default: 'non-billable' },
billingRate: { type: Number, default: null },
currency:    { type: String, default: null },
```

Note: `clientName` defaults to `''` rather than being `required: true` at schema level so existing documents remain valid. The route layer enforces the requirement for new projects.

- [ ] **Step 2: Verify the backend starts cleanly**

Run: `cd auth-api && node src/server.js`
Expected: Server starts without errors. Ctrl+C to stop.

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/Project.js
git commit -m "feat: add client and billing fields to Project model"
```

---

### Task 2: Accept Client & Billing Fields in Project Routes

**Files:**
- Modify: `auth-api/src/routes/projects.js`

**Interfaces:**
- Consumes: Project model with `clientName`, `billingType`, `billingRate`, `currency` (Task 1)
- Produces: `POST /projects` requires `clientName`, accepts `billingType`, `billingRate`, `currency`. `PATCH /projects/:id` accepts updates to these fields. `GET` endpoints return them automatically.

- [ ] **Step 1: Update POST /projects to require clientName**

In `auth-api/src/routes/projects.js`, in the `router.post('/')` handler, destructure the new fields and validate `clientName`:

```js
router.post('/', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const { name, description, members, startDate, targetDate, requiredSkills, clientName, billingType, billingRate, currency } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    if (!clientName || !String(clientName).trim()) return res.status(400).json({ error: 'clientName required' });
    const project = await Project.create({
      name: String(name).trim(),
      description: String(description || ''),
      ownerPm: req.user.sub,
      members: Array.isArray(members) ? members : [],
      requiredSkills: await validActiveSkillIds(requiredSkills),
      startDate: startDate || null,
      targetDate: targetDate || null,
      clientName: String(clientName).trim(),
      billingType: ['billable', 'non-billable'].includes(billingType) ? billingType : 'non-billable',
      billingRate: billingType === 'billable' && billingRate != null ? Number(billingRate) : null,
      currency: billingType === 'billable' && currency ? String(currency) : null,
    });
    res.status(201).json(project);
  }));
```

- [ ] **Step 2: Update PATCH /projects/:id to accept new fields**

In the `router.patch('/:id')` handler, extend the allowed-fields loop and add billing-specific handling after the loop:

```js
for (const f of ['name', 'description', 'status', 'startDate', 'targetDate', 'clientName', 'billingType', 'billingRate', 'currency']) {
    if (f in (req.body || {})) project[f] = req.body[f];
  }
```

- [ ] **Step 3: Test manually with curl**

```bash
# Create project with billing info
curl -X POST http://localhost:4000/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"Test Billing","clientName":"Acme Corp","billingType":"billable","billingRate":150,"currency":"USD"}'

# Should return project with clientName, billingType, billingRate, currency

# Test missing clientName returns error
curl -X POST http://localhost:4000/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"No Client"}'

# Should return 400: clientName required
```

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/routes/projects.js
git commit -m "feat: accept client and billing fields in project routes"
```

---

### Task 3: Project Creation Form — Client & Billing UI

**Files:**
- Modify: `web/src/pm/Projects.tsx`
- Modify: `web/src/pm/pmApi.ts`

**Interfaces:**
- Consumes: `POST /projects` now requires `clientName` (Task 2)
- Produces: Project creation form with clientName, billingType, billingRate, currency fields. Project list table shows clientName column.

- [ ] **Step 1: Update Project type and createProject in pmApi.ts**

In `web/src/pm/pmApi.ts`, update the `Project` type to include the new fields:

```ts
export type Project = {
  _id: string; name: string; description: string; ownerPm: string;
  members: string[]; requiredSkills?: string[]; status: string; startDate: string | null; targetDate: string | null;
  progress?: number; taskCount?: number; doneCount?: number;
  clientName?: string; billingType?: 'billable' | 'non-billable'; billingRate?: number | null; currency?: string | null;
};
```

Also update `ProjectDetailShape` to include these fields by adding them after the existing fields:

```ts
export type ProjectDetailShape = Omit<Project, 'members' | 'ownerPm' | 'requiredSkills'> & {
  members: Person[]; ownerPm: Person; requiredSkills: { _id: string; name: string }[];
};
```

- [ ] **Step 2: Add form state and inputs to Projects component**

In `web/src/pm/Projects.tsx`, inside the `Projects` function component, add state for the new fields after the existing `description` state:

```tsx
const [clientName, setClientName] = useState('');
const [billingType, setBillingType] = useState<'billable' | 'non-billable'>('non-billable');
const [billingRate, setBillingRate] = useState('');
const [currency, setCurrency] = useState('USD');
```

Update the `add()` function to pass the new fields:

```tsx
async function add() {
    if (!name.trim()) return;
    if (!clientName.trim()) { setError('Client name is required'); return; }
    setError('');
    try {
      await createProject({
        name: name.trim(), description: description.trim(),
        clientName: clientName.trim(), billingType,
        billingRate: billingType === 'billable' && billingRate ? Number(billingRate) : null,
        currency: billingType === 'billable' ? currency : null,
      });
      setName(''); setDescription(''); setClientName(''); setBillingType('non-billable'); setBillingRate(''); setCurrency('USD');
      reload();
    } catch (e) { setError((e as Error).message); }
  }
```

- [ ] **Step 3: Add form inputs in the JSX header area**

In the `<div className="ts-nav-left">` section of the Projects component, add the new input fields after the description input and before the Create button:

```tsx
<input className="input" placeholder="Client name *" value={clientName}
  onChange={(e) => setClientName(e.target.value)}
  onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
<select className="input pm-select" value={billingType}
  onChange={(e) => setBillingType(e.target.value as 'billable' | 'non-billable')}>
  <option value="non-billable">Non-Billable</option>
  <option value="billable">Billable</option>
</select>
{billingType === 'billable' && (
  <>
    <input className="input" type="number" placeholder="Billing rate" value={billingRate}
      onChange={(e) => setBillingRate(e.target.value)} style={{ width: 100 }} />
    <select className="input pm-select" value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: 80 }}>
      <option value="USD">USD</option>
      <option value="EUR">EUR</option>
      <option value="GBP">GBP</option>
      <option value="INR">INR</option>
    </select>
  </>
)}
```

- [ ] **Step 4: Add Client column to project list table**

In the table header, add after the Project column:

```tsx
<th className="col-left">Client</th>
```

In the table body row, add after the project name `<td>`:

```tsx
<td className="col-left ts-sub">{p.clientName || '—'}</td>
```

- [ ] **Step 5: Show billing info on ProjectDetail page**

In the `ProjectDetail` component, inside the Description card section, add after the description paragraph:

```tsx
<div className="ts-sub" style={{ marginTop: 8 }}>
  <strong>Client:</strong> {project.clientName || 'Unassigned'}
  {' · '}
  <span className={`status-badge ${project.billingType === 'billable' ? 'status-done' : 'status-archived'}`}>
    <span className="status-dot" aria-hidden="true" />
    {project.billingType === 'billable' ? 'Billable' : 'Non-Billable'}
  </span>
  {project.billingType === 'billable' && project.billingRate != null && (
    <span> · {project.currency ?? 'USD'} {project.billingRate}/hr</span>
  )}
</div>
```

- [ ] **Step 6: Test in browser**

Run the dev server (`cd web && npm run dev`). Log in as PM/Admin. Verify:
1. Create form shows client name, billing type, rate, and currency fields.
2. Billing rate/currency only appear when "Billable" is selected.
3. Creating a project without client name shows an error.
4. Created project appears in list with client column.
5. Project detail shows client name and billing badge.

- [ ] **Step 7: Commit**

```bash
git add web/src/pm/Projects.tsx web/src/pm/pmApi.ts
git commit -m "feat: add client and billing fields to project creation UI"
```

---

### Task 4: Add Reporting Manager Role to User Model and Admin Routes

**Files:**
- Modify: `auth-api/src/models/User.js`
- Modify: `auth-api/src/routes/admin.js`
- Modify: `web/src/pm/nav.ts`

**Interfaces:**
- Produces: User model with `reporting_manager` in role enum and `reportingManagerId` field. Admin route accepts the new role. Nav exposes RM-appropriate pages.

- [ ] **Step 1: Update User model**

In `auth-api/src/models/User.js`, change the role enum and add `reportingManagerId`:

```js
role: { type: String, enum: ['admin', 'pm', 'employee', 'reporting_manager'], default: 'employee' },
```

Add after the `attendanceActivatedDate` field:

```js
reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
```

- [ ] **Step 2: Update admin ROLES constant and add RM assignment endpoint**

In `auth-api/src/routes/admin.js`, update the ROLES constant:

```js
const ROLES = ['admin', 'pm', 'employee', 'reporting_manager'];
```

Add a new endpoint before the `router.delete` handler:

```js
router.patch('/users/:id/reporting-manager', asyncHandler(async (req, res) => {
    const { reportingManagerId } = req.body || {};
    if (reportingManagerId !== null) {
      if (!reportingManagerId || !mongoose.isValidObjectId(reportingManagerId)) {
        return res.status(400).json({ error: 'invalid reportingManagerId' });
      }
      const rm = await User.findById(reportingManagerId);
      if (!rm || rm.role !== 'reporting_manager') {
        return res.status(400).json({ error: 'target user must have reporting_manager role' });
      }
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { reportingManagerId: reportingManagerId || null },
      { new: true },
    ).select('email displayName role active reportingManagerId');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  }));
```

Also add `import mongoose from 'mongoose';` at the top of the file.

- [ ] **Step 3: Update GET /admin/users to return reportingManagerId**

Change the `.select()` call in the `router.get('/users')` handler:

```js
const users = await User.find().select('email displayName role active reestimationCount reportingManagerId').sort('email');
```

- [ ] **Step 4: Update nav.ts for reporting_manager role**

In `web/src/pm/nav.ts`, update the `Role` type and add navigation for RM:

```ts
export type Role = 'admin' | 'pm' | 'employee' | 'reporting_manager';
```

Add a new block before the employee return in `navForRole`:

```ts
if (role === 'reporting_manager') {
    return [
      { key: 'requests', label: 'Requests' },
      timesheet,
      attendance,
    ];
  }
```

- [ ] **Step 5: Verify backend starts and nav works**

Start the backend and frontend. Verify no errors.

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/models/User.js auth-api/src/routes/admin.js web/src/pm/nav.ts
git commit -m "feat: add reporting_manager role and reportingManagerId to User model"
```

---

### Task 5: Admin UI for Reporting Manager Assignment

**Files:**
- Modify: `web/src/pm/AdminUsers.tsx`
- Modify: `web/src/pm/pmApi.ts`

**Interfaces:**
- Consumes: `PATCH /admin/users/:id/reporting-manager` endpoint (Task 4), `GET /admin/users` returns `reportingManagerId` (Task 4)
- Produces: Admin users table shows RM dropdown per employee, API function `setReportingManager()`

- [ ] **Step 1: Add API function for RM assignment in pmApi.ts**

In `web/src/pm/pmApi.ts`, add after the `deleteUser` export:

```ts
export const setReportingManager = (id: string, reportingManagerId: string | null) =>
  authed(`/admin/users/${id}/reporting-manager`, 'PATCH', { reportingManagerId });
```

Also update the `UserRow` type to include `reportingManagerId`:

```ts
export type UserRow = { _id: string; email: string; displayName: string; role: Role; active?: boolean; reestimationCount?: number; reportingManagerId?: string | null };
```

- [ ] **Step 2: Update AdminUsers component**

In `web/src/pm/AdminUsers.tsx`, update imports to include `setReportingManager`:

```ts
import { listUsers, setUserRole, setUserActive, deleteUser, setReportingManager, UserRow } from './pmApi';
```

Update the ROLES array:

```ts
const ROLES: Role[] = ['admin', 'pm', 'employee', 'reporting_manager'];
```

Add a handler for RM assignment inside the component:

```tsx
async function assignRM(userId: string, rmId: string | null) {
    setError('');
    try {
      await setReportingManager(userId, rmId);
      setUsers((us) => us.map((u) => (u._id === userId ? { ...u, reportingManagerId: rmId } : u)));
    } catch (e) {
      setError((e as Error).message);
    }
  }
```

Add a summary tile for Reporting Managers after the employees tile:

```tsx
const rms = users.filter((u) => u.role === 'reporting_manager').length;
```

```tsx
<div className="ts-tile stat-est">
  <span className="ts-tile-label">Reporting Managers</span>
  <span className="ts-tile-value">{rms}</span>
</div>
```

- [ ] **Step 3: Add RM column to the users table**

Add a new table header after the Role column:

```tsx
<th className="col-left">Reporting Manager</th>
```

Add a new `<td>` cell after the role select cell, inside each user row:

```tsx
<td className="col-left">
  {(u.role === 'employee') ? (
    <select className="input pm-select" value={u.reportingManagerId || ''}
      onChange={(e) => assignRM(u._id, e.target.value || null)}>
      <option value="">None</option>
      {users.filter((x) => x.role === 'reporting_manager' && x.active !== false).map((rm) => (
        <option key={rm._id} value={rm._id}>{personName(rm)}</option>
      ))}
    </select>
  ) : (
    <span className="ts-sub">—</span>
  )}
</td>
```

Update the `colSpan` on the "No users found" row from 4 to 5.

- [ ] **Step 4: Test in browser**

Log in as Admin. Go to Users page. Verify:
1. Role dropdown now includes "reporting_manager".
2. Setting a user's role to reporting_manager works.
3. Employees show a "Reporting Manager" dropdown listing all active RMs.
4. Assigning/unassigning an RM works.

- [ ] **Step 5: Commit**

```bash
git add web/src/pm/AdminUsers.tsx web/src/pm/pmApi.ts
git commit -m "feat: admin UI for assigning reporting managers to employees"
```

---

### Task 6: RM Team Endpoint and Scoped Timesheet/Attendance Access

**Files:**
- Modify: `auth-api/src/routes/users.js`
- Modify: `auth-api/src/routes/timesheets.js`
- Modify: `auth-api/src/routes/attendance.js`

**Interfaces:**
- Consumes: User model with `reportingManagerId` (Task 4)
- Produces: `GET /users/my-team` returns RM's assigned employees. Timesheet review and attendance team endpoints accept `reporting_manager` role, scoped to their team.

- [ ] **Step 1: Add GET /users/my-team endpoint**

In `auth-api/src/routes/users.js`, add a new route (before any `/:id` routes to avoid route conflicts):

```js
router.get('/my-team', requireRole('reporting_manager'), asyncHandler(async (req, res) => {
    const team = await User.find({ reportingManagerId: req.user.sub, active: true })
      .select('displayName email role reportingManagerId')
      .sort('displayName');
    res.json(team);
  }));
```

- [ ] **Step 2: Extend timesheet review to allow reporting_manager**

In `auth-api/src/routes/timesheets.js`, update the review GET route:

Change `requireRole('pm', 'admin')` to `requireRole('pm', 'admin', 'reporting_manager')` on the `router.get('/review', ...)` line.

Inside the handler, scope the query for RMs:

```js
router.get('/review', requireRole('pm', 'admin', 'reporting_manager'), asyncHandler(async (req, res) => {
    const status = req.query.status || 'submitted';
    let filter = { status };
    if (req.user.role === 'reporting_manager') {
      const teamIds = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      filter.userId = { $in: teamIds.map((u) => u._id) };
    }
    const docs = await Timesheet.find(filter)
      .populate('userId', 'displayName email')
      .sort('-submittedAt');
    // ... rest of handler unchanged
```

Also add `import { User } from '../models/User.js';` at the top (it's already imported — verify).

Also update `router.patch('/review/:id', ...)` to `requireRole('pm', 'admin', 'reporting_manager')`.

Also update `router.get('/review/:id/notes', ...)` to `requireRole('pm', 'admin', 'reporting_manager')`.

- [ ] **Step 3: Extend attendance team to allow reporting_manager**

In `auth-api/src/routes/attendance.js`, find the `GET /team` endpoint. Change its `requireRole` to include `'reporting_manager'`. Inside the handler, scope to assigned employees when the user is an RM:

```js
if (req.user.role === 'reporting_manager') {
  const teamUsers = await User.find({ reportingManagerId: req.user.sub }).select('_id');
  // filter attendance data to only these user IDs
}
```

The exact implementation depends on the current shape of the `/team` handler — adapt the query filter accordingly.

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/routes/users.js auth-api/src/routes/timesheets.js auth-api/src/routes/attendance.js
git commit -m "feat: RM team endpoint and scoped timesheet/attendance access"
```

---

### Task 7: Leave Workflow — Route to Reporting Manager

**Files:**
- Modify: `auth-api/src/models/Leave.js`
- Modify: `auth-api/src/routes/leave.js`

**Interfaces:**
- Consumes: User model with `reportingManagerId` (Task 4)
- Produces: Leave model has `assignedApprover` field. POST /leave auto-routes to RM. GET /leave/pending scoped by role. PATCH /leave/:id/decide allows RM for their team's requests.

- [ ] **Step 1: Add assignedApprover to Leave model**

In `auth-api/src/models/Leave.js`, add after the `decidedAt` field:

```js
assignedApprover: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
```

- [ ] **Step 2: Update POST /leave to set assignedApprover**

In `auth-api/src/routes/leave.js`, add `import { User } from '../models/User.js';` at the top.

In the `router.post('/')` handler, after balance validation and before `Leave.create(...)`, look up the requester's RM:

```js
const requester = await User.findById(req.user.sub).select('reportingManagerId');
const assignedApprover = requester?.reportingManagerId || null;
```

Pass `assignedApprover` into the `Leave.create()` call:

```js
const doc = await Leave.create({
      userId: req.user.sub,
      type, startDate, endDate,
      halfDay: halfDayValue,
      requestedDays,
      reason: String(reason || ''),
      assignedApprover,
    });
```

- [ ] **Step 3: Update GET /leave/pending for role-based scoping**

Change `requireRole('admin', 'pm')` to `requireRole('admin', 'pm', 'reporting_manager')`.

Update the query inside the handler:

```js
router.get('/pending', requireRole('admin', 'pm', 'reporting_manager'), asyncHandler(async (req, res) => {
    let filter = { status: 'pending' };
    if (req.user.role === 'reporting_manager') {
      filter.assignedApprover = req.user.sub;
    } else if (req.user.role === 'pm') {
      filter.assignedApprover = null;
    }
    // admin sees all — no extra filter
    const docs = await Leave.find(filter)
      .populate('userId', 'displayName email')
      .sort({ requestedAt: -1 });
    res.json(docs.map((d) => ({ ...d.toObject(), days: d.requestedDays || workingDays(d.startDate, d.endDate) })));
  }));
```

- [ ] **Step 4: Update PATCH /leave/:id/decide for RM authorization**

Change `requireRole('admin', 'pm')` to `requireRole('admin', 'pm', 'reporting_manager')`.

Add an authorization check after finding the doc:

```js
if (req.user.role === 'reporting_manager' && String(doc.assignedApprover) !== req.user.sub) {
      return res.status(403).json({ error: 'you are not the assigned approver for this request' });
    }
```

- [ ] **Step 5: Test the leave workflow**

1. As Admin, assign an RM to an employee via `PATCH /admin/users/:id/reporting-manager`.
2. As that employee, submit a leave request via `POST /leave`. Verify the response includes `assignedApprover` set to the RM's ID.
3. As the RM, call `GET /leave/pending`. Verify only the assigned employee's request appears.
4. As the RM, approve the request via `PATCH /leave/:id/decide`. Verify it succeeds.
5. As a different RM, try to approve the same request. Verify 403 forbidden.
6. Submit a leave request for an employee with no RM assigned. Verify PM can see it in pending queue.

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/models/Leave.js auth-api/src/routes/leave.js
git commit -m "feat: route leave requests to reporting manager with admin fallback"
```

---

### Task 8: Add Billable Tracking to Timesheet Model

**Files:**
- Modify: `auth-api/src/models/Timesheet.js`

**Interfaces:**
- Produces: Timesheet task rows include a `billable` sub-document with per-day Boolean values (null = inherit from project)

- [ ] **Step 1: Add billable schema to Timesheet model**

In `auth-api/src/models/Timesheet.js`, add a new schema definition after `notesSchema`:

```js
const billableSchema = new mongoose.Schema(
  {
    mon: { type: Boolean, default: null },
    tue: { type: Boolean, default: null },
    wed: { type: Boolean, default: null },
    thu: { type: Boolean, default: null },
    fri: { type: Boolean, default: null },
  },
  { _id: false }
);
```

Add the `billable` field to `taskSchema` after `taskId`:

```js
billable: { type: billableSchema, default: () => ({}) },
```

- [ ] **Step 2: Verify backend starts**

Run: `cd auth-api && node src/server.js`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/Timesheet.js
git commit -m "feat: add per-day billable tracking to timesheet task rows"
```

---

### Task 9: Resolve Billable Status in Timesheet Routes

**Files:**
- Modify: `auth-api/src/routes/timesheets.js`

**Interfaces:**
- Consumes: Timesheet `billable` field (Task 8), Project `billingType` field (Task 1)
- Produces: `GET /timesheets/:weekStart` returns `effectiveBillable` per task row. `PUT /timesheets/:weekStart` persists `billable` overrides. `GET /timesheets/review` returns `billableMinutes` and `nonBillableMinutes`.

- [ ] **Step 1: Add billable resolution to GET /timesheets/:weekStart**

In the `router.get('/:weekStart')` handler, after building `taskInfoById`, build a map of project billing types for all linked tasks:

```js
const projectIds = [...new Set(infoTasks.map((t) => String(t.project)).filter(Boolean))];
const billingProjects = projectIds.length
  ? await Project.find({ _id: { $in: projectIds } }).select('billingType')
  : [];
const billingByProject = new Map(billingProjects.map((p) => [String(p._id), p.billingType === 'billable']));
```

When building the response tasks, add `effectiveBillable` to each task's output. After the `mergeWeekRows` call, map over the result:

```js
const tasksWithBillable = tasks.map((t) => {
      const savedRow = (doc?.tasks || []).find((s) => s.id === t.id);
      const projectBillable = t.projectId ? (billingByProject.get(t.projectId) ?? false) : false;
      const billableRaw = savedRow?.billable || {};
      const effectiveBillable = {};
      for (const d of DAYS) {
        effectiveBillable[d] = billableRaw[d] != null ? billableRaw[d] : projectBillable;
      }
      return { ...t, billable: billableRaw, effectiveBillable };
    });
```

Use `tasksWithBillable` in the response instead of `tasks`.

- [ ] **Step 2: Persist billable in PUT /timesheets/:weekStart**

In the `sanitizeRows` call result processing (or directly after), preserve the `billable` field from the incoming `req.body.tasks`. In the `rows` array that gets saved to the DB, include `billable` from the submitted data:

After `const { rows, consumed } = computeRowLock(...)`, map billable data onto rows:

```js
const billableByRowId = new Map(
      (Array.isArray(req.body?.tasks) ? req.body.tasks : [])
        .filter((t) => t?.id && t?.billable)
        .map((t) => [t.id, t.billable])
    );
    const rowsWithBillable = rows.map((r) => ({
      ...r,
      billable: billableByRowId.get(r.id) || r.billable || {},
    }));
```

Use `rowsWithBillable` in the `$set: { tasks: rowsWithBillable }` update.

- [ ] **Step 3: Add billable summary to GET /timesheets/review**

In the `router.get('/review')` handler, calculate billable and non-billable minutes. After fetching docs, for each doc compute the sums and include in the response:

```js
res.json(docs.map((d) => {
      let billableMinutes = 0;
      let nonBillableMinutes = 0;
      for (const t of d.tasks || []) {
        for (const day of DAYS) {
          const mins = t.entries?.[day] || 0;
          if (mins > 0) {
            const isBillable = t.billable?.[day] != null ? t.billable[day] : false;
            if (isBillable) billableMinutes += mins;
            else nonBillableMinutes += mins;
          }
        }
      }
      return {
        _id: String(d._id),
        user: d.userId ? { _id: String(d.userId._id), displayName: d.userId.displayName, email: d.userId.email } : null,
        weekStart: d.weekStart,
        submittedAt: d.submittedAt,
        totalMinutes: d.tasks.reduce((sum, t) => sum + DAYS.reduce((a, day) => a + (t.entries?.[day] || 0), 0), 0),
        billableMinutes,
        nonBillableMinutes,
      };
    }));
```

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/routes/timesheets.js
git commit -m "feat: resolve and persist billable status in timesheet routes"
```

---

### Task 10: Utilization Report Endpoint

**Files:**
- Create: `auth-api/src/routes/reports.js`
- Modify: `auth-api/src/app.js`

**Interfaces:**
- Consumes: Timesheet model with `billable` field (Task 8)
- Produces: `GET /reports/utilization?startDate=...&endDate=...` returns per-employee billable/non-billable/utilization data

- [ ] **Step 1: Create the reports router**

Create `auth-api/src/routes/reports.js`:

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Timesheet } from '../models/Timesheet.js';
import { User } from '../models/User.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

export function createReportsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/utilization', requireRole('pm', 'admin'), asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    const timesheets = await Timesheet.find({
      weekStart: { $gte: startDate, $lte: endDate },
    }).populate('userId', 'displayName email');

    const byUser = new Map();
    for (const ts of timesheets) {
      if (!ts.userId) continue;
      const uid = String(ts.userId._id);
      if (!byUser.has(uid)) {
        byUser.set(uid, {
          userId: uid,
          displayName: ts.userId.displayName,
          email: ts.userId.email,
          totalMinutes: 0,
          billableMinutes: 0,
        });
      }
      const entry = byUser.get(uid);
      for (const t of ts.tasks || []) {
        for (const d of DAYS) {
          const mins = t.entries?.[d] || 0;
          if (mins > 0) {
            entry.totalMinutes += mins;
            const isBillable = t.billable?.[d] != null ? t.billable[d] : false;
            if (isBillable) entry.billableMinutes += mins;
          }
        }
      }
    }

    const employees = [...byUser.values()].map((e) => ({
      ...e,
      nonBillableMinutes: e.totalMinutes - e.billableMinutes,
      utilizationPct: e.totalMinutes > 0 ? Math.round((e.billableMinutes / e.totalMinutes) * 100) : 0,
    }));

    const totals = employees.reduce(
      (acc, e) => ({
        totalMinutes: acc.totalMinutes + e.totalMinutes,
        billableMinutes: acc.billableMinutes + e.billableMinutes,
      }),
      { totalMinutes: 0, billableMinutes: 0 },
    );

    res.json({
      startDate, endDate,
      employees,
      summary: {
        ...totals,
        nonBillableMinutes: totals.totalMinutes - totals.billableMinutes,
        utilizationPct: totals.totalMinutes > 0 ? Math.round((totals.billableMinutes / totals.totalMinutes) * 100) : 0,
      },
    });
  }));

  return router;
}
```

- [ ] **Step 2: Mount the reports router in app.js**

In `auth-api/src/app.js`, add the import:

```js
import { createReportsRouter } from './routes/reports.js';
```

Add the mount after the leave router:

```js
app.use('/reports', createReportsRouter());
```

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/routes/reports.js auth-api/src/app.js
git commit -m "feat: add utilization report endpoint"
```

---

### Task 11: Billable Toggle in Timesheet Grid UI

**Files:**
- Modify: `web/src/timesheet/timesheetApi.ts`
- Modify: `web/src/timesheet/TaskRow.tsx`
- Modify: `web/src/timesheet/TimesheetGrid.tsx`
- Modify: `web/src/timesheet/SummaryTiles.tsx`
- Modify: `web/src/timesheet/TimesheetPage.tsx`

**Interfaces:**
- Consumes: `GET /timesheets/:weekStart` returns `billable` and `effectiveBillable` per task (Task 9)
- Produces: Timesheet UI shows billable toggle per cell, summary tiles show billable breakdown

- [ ] **Step 1: Update Task type in timesheetApi.ts**

In `web/src/timesheet/timesheetApi.ts`, add billable fields to the `Task` type:

```ts
export type BillableMap = Record<Day, boolean | null>;
export type Task = {
  id: string;
  name: string;
  description?: string;
  entries: Entries;
  notes: Notes;
  taskId?: string | null;
  locked?: boolean;
  percentComplete?: number;
  estimatedHours?: number;
  actualMinutes?: number;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  projectId?: string | null;
  billable?: BillableMap;
  effectiveBillable?: Record<Day, boolean>;
};
```

- [ ] **Step 2: Add billable toggle to TaskRow**

In `web/src/timesheet/TaskRow.tsx`, add a new prop to the `Props` type:

```ts
onBillableChange: (day: Day, value: boolean | null) => void;
canOverrideBillable?: boolean;
```

Inside each day's `<td>`, below the `<TimeCell>` component, add a small billable indicator:

```tsx
{task.effectiveBillable && (
  <button
    type="button"
    className={`ts-billable ${task.effectiveBillable[d] ? 'billable' : 'non-billable'}${task.billable?.[d] != null ? ' overridden' : ''}`}
    title={task.effectiveBillable[d] ? 'Billable' : 'Non-billable'}
    disabled={!canOverrideBillable}
    onClick={() => {
      const current = task.billable?.[d];
      const projectDefault = task.effectiveBillable![d] !== (current ?? task.effectiveBillable![d]);
      onBillableChange(d, current != null ? null : !task.effectiveBillable![d]);
    }}
  >
    $
  </button>
)}
```

- [ ] **Step 3: Wire billable change through TimesheetGrid and TimesheetPage**

In `TimesheetGrid.tsx`, pass through the `onBillableChange` callback to each `TaskRow`. In `TimesheetPage.tsx`, handle the change by updating the task's `billable` map in state and including it in the save payload.

The exact wiring follows the same pattern as `onCellChange` and `onNoteChange` — thread it through from page state to the row component.

- [ ] **Step 4: Update SummaryTiles to show billable breakdown**

In `web/src/timesheet/SummaryTiles.tsx`, add new props:

```ts
billableMinutes?: number;
nonBillableMinutes?: number;
```

Add a new tile after the "This week" tile:

```tsx
{(billableMinutes != null || nonBillableMinutes != null) && (
  <div className="ts-tile">
    <span className="ts-tile-label">Billable</span>
    <span className="ts-tile-value">{formatMinutes(billableMinutes ?? 0)}</span>
    <span className="ts-tile-foot">{formatMinutes(nonBillableMinutes ?? 0)} non-billable</span>
  </div>
)}
```

- [ ] **Step 5: Add CSS for billable toggle**

Add to the existing CSS file (find the main stylesheet used by timesheet components):

```css
.ts-billable {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  border: 1px solid transparent;
  cursor: default;
  line-height: 1;
  margin-top: 2px;
}
.ts-billable.billable { color: var(--success, #22c55e); border-color: var(--success, #22c55e); }
.ts-billable.non-billable { color: var(--muted, #94a3b8); }
.ts-billable.overridden { font-style: italic; }
.ts-billable:not(:disabled) { cursor: pointer; }
```

- [ ] **Step 6: Test in browser**

1. Create a billable project (Task 3) and assign a task.
2. Open the timesheet for the current week. Verify each cell shows a `$` indicator.
3. Billable project tasks should show green `$`, non-billable should show muted.
4. As PM/Admin, click to toggle — should switch and show as "overridden".
5. Summary tiles should show billable/non-billable breakdown.

- [ ] **Step 7: Commit**

```bash
git add web/src/timesheet/timesheetApi.ts web/src/timesheet/TaskRow.tsx web/src/timesheet/TimesheetGrid.tsx web/src/timesheet/SummaryTiles.tsx web/src/timesheet/TimesheetPage.tsx
git commit -m "feat: billable toggle and summary in timesheet UI"
```

---

### Task 12: URL Tracking — Models

**Files:**
- Create: `auth-api/src/models/UrlActivity.js`
- Create: `auth-api/src/models/UrlCategory.js`

**Interfaces:**
- Produces: `UrlActivity` and `UrlCategory` Mongoose models used by the url-tracking routes (Task 13)

- [ ] **Step 1: Create UrlActivity model**

Create `auth-api/src/models/UrlActivity.js`:

```js
import mongoose from 'mongoose';

const urlActivitySchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url:        { type: String, required: true, trim: true },
  title:      { type: String, default: '' },
  category:   { type: String, enum: ['productive', 'neutral', 'non-productive'], default: 'neutral' },
  startedAt:  { type: Date, required: true },
  endedAt:    { type: Date, default: null },
  durationMs: { type: Number, default: 0 },
  source:     { type: String, default: 'api' },
});

urlActivitySchema.index({ userId: 1, startedAt: -1 });
urlActivitySchema.index({ category: 1 });

export const UrlActivity = mongoose.model('UrlActivity', urlActivitySchema);
```

- [ ] **Step 2: Create UrlCategory model**

Create `auth-api/src/models/UrlCategory.js`:

```js
import mongoose from 'mongoose';

const urlCategorySchema = new mongoose.Schema({
  pattern:  { type: String, required: true, unique: true, trim: true },
  category: { type: String, enum: ['productive', 'neutral', 'non-productive'], required: true },
  label:    { type: String, default: '' },
});

export const UrlCategory = mongoose.model('UrlCategory', urlCategorySchema);
```

- [ ] **Step 3: Commit**

```bash
git add auth-api/src/models/UrlActivity.js auth-api/src/models/UrlCategory.js
git commit -m "feat: add UrlActivity and UrlCategory models"
```

---

### Task 13: URL Tracking — Routes

**Files:**
- Create: `auth-api/src/routes/urlTracking.js`
- Modify: `auth-api/src/app.js`

**Interfaces:**
- Consumes: `UrlActivity` and `UrlCategory` models (Task 12), User `reportingManagerId` for RM scoping (Task 4)
- Produces: Full URL tracking API — bulk ingest, activity listing, summary, category CRUD

- [ ] **Step 1: Create the URL tracking router**

Create `auth-api/src/routes/urlTracking.js`:

```js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { UrlActivity } from '../models/UrlActivity.js';
import { UrlCategory } from '../models/UrlCategory.js';
import { User } from '../models/User.js';

function categorizeUrl(url, rules) {
  try {
    const hostname = new URL(url).hostname;
    for (const rule of rules) {
      if (hostname.includes(rule.pattern) || url.includes(rule.pattern)) {
        return rule.category;
      }
    }
  } catch { /* invalid URL */ }
  return 'neutral';
}

export function createUrlTrackingRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.post('/activities', asyncHandler(async (req, res) => {
    const { activities } = req.body || {};
    if (!Array.isArray(activities) || activities.length === 0) {
      return res.status(400).json({ error: 'activities array required' });
    }
    if (activities.length > 100) {
      return res.status(400).json({ error: 'max 100 activities per request' });
    }

    const rules = await UrlCategory.find();
    const docs = activities.map((a) => ({
      userId: req.user.sub,
      url: String(a.url || ''),
      title: String(a.title || ''),
      category: categorizeUrl(a.url, rules),
      startedAt: new Date(a.startedAt),
      endedAt: a.endedAt ? new Date(a.endedAt) : null,
      durationMs: a.endedAt && a.startedAt
        ? Math.max(0, new Date(a.endedAt) - new Date(a.startedAt))
        : 0,
      source: 'api',
    }));

    const inserted = await UrlActivity.insertMany(docs);
    res.status(201).json({ count: inserted.length });
  }));

  router.get('/activities', asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    let userFilter;
    if (req.user.role === 'admin' || req.user.role === 'pm') {
      userFilter = {};
    } else if (req.user.role === 'reporting_manager') {
      const team = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      userFilter = { userId: { $in: [req.user.sub, ...team.map((u) => u._id)] } };
    } else {
      userFilter = { userId: req.user.sub };
    }

    const activities = await UrlActivity.find({
      ...userFilter,
      startedAt: { $gte: new Date(startDate), $lte: new Date(endDate + 'T23:59:59Z') },
    }).populate('userId', 'displayName email').sort({ startedAt: -1 }).limit(500);

    res.json(activities);
  }));

  router.get('/summary', asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    let matchFilter = {
      startedAt: { $gte: new Date(startDate), $lte: new Date(endDate + 'T23:59:59Z') },
    };
    if (req.user.role === 'reporting_manager') {
      const team = await User.find({ reportingManagerId: req.user.sub }).select('_id');
      matchFilter.userId = { $in: [req.user.sub, ...team.map((u) => u._id)] };
    } else if (req.user.role === 'employee') {
      matchFilter.userId = req.user.sub;
    }

    const byCategory = await UrlActivity.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$category', totalMs: { $sum: '$durationMs' } } },
    ]);

    const topUrls = await UrlActivity.aggregate([
      { $match: matchFilter },
      { $group: { _id: { url: '$url', category: '$category' }, totalMs: { $sum: '$durationMs' } } },
      { $sort: { totalMs: -1 } },
      { $limit: 20 },
      { $project: { _id: 0, url: '$_id.url', category: '$_id.category', totalMs: 1 } },
    ]);

    const byUser = await UrlActivity.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$userId', totalMs: { $sum: '$durationMs' } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { _id: 0, userId: '$_id', displayName: '$user.displayName', totalMs: 1 } },
    ]);

    const categoryMap = {};
    for (const c of byCategory) { categoryMap[c._id] = c.totalMs; }

    res.json({ byCategory: categoryMap, topUrls, byUser });
  }));

  router.post('/categories', requireRole('admin'), asyncHandler(async (req, res) => {
    const { pattern, category, label } = req.body || {};
    if (!pattern) return res.status(400).json({ error: 'pattern required' });
    if (!['productive', 'neutral', 'non-productive'].includes(category)) {
      return res.status(400).json({ error: 'invalid category' });
    }
    const doc = await UrlCategory.create({
      pattern: String(pattern).trim(),
      category,
      label: String(label || ''),
    });
    res.status(201).json(doc);
  }));

  router.get('/categories', asyncHandler(async (req, res) => {
    const cats = await UrlCategory.find().sort('pattern');
    res.json(cats);
  }));

  router.patch('/categories/:id', requireRole('admin'), asyncHandler(async (req, res) => {
    const update = {};
    if (typeof req.body?.pattern === 'string') update.pattern = req.body.pattern.trim();
    if (['productive', 'neutral', 'non-productive'].includes(req.body?.category)) update.category = req.body.category;
    if (typeof req.body?.label === 'string') update.label = req.body.label;
    const doc = await UrlCategory.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  }));

  router.delete('/categories/:id', requireRole('admin'), asyncHandler(async (req, res) => {
    const doc = await UrlCategory.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  }));

  return router;
}
```

- [ ] **Step 2: Mount in app.js**

In `auth-api/src/app.js`, add:

```js
import { createUrlTrackingRouter } from './routes/urlTracking.js';
```

Mount after the reports router:

```js
app.use('/url-tracking', createUrlTrackingRouter());
```

- [ ] **Step 3: Test the API with curl**

```bash
# Create a category rule
curl -X POST http://localhost:4000/url-tracking/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"pattern":"github.com","category":"productive","label":"GitHub"}'

# Ingest activities
curl -X POST http://localhost:4000/url-tracking/activities \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"activities":[{"url":"https://github.com/org/repo","title":"PR Review","startedAt":"2026-06-23T09:00:00Z","endedAt":"2026-06-23T09:30:00Z"}]}'

# Get summary
curl "http://localhost:4000/url-tracking/summary?startDate=2026-06-23&endDate=2026-06-23" \
  -H "Authorization: Bearer <token>"
```

- [ ] **Step 4: Commit**

```bash
git add auth-api/src/routes/urlTracking.js auth-api/src/app.js
git commit -m "feat: add URL tracking routes with bulk ingest and reporting"
```

---

### Task 14: URL Tracking — Frontend Pages

**Files:**
- Create: `web/src/pm/UrlTracking.tsx`
- Create: `web/src/pm/UrlCategories.tsx`
- Create: `web/src/pm/urlTrackingApi.ts`
- Modify: `web/src/pm/nav.ts`
- Modify: `web/src/AppShell.tsx`

**Interfaces:**
- Consumes: URL tracking API endpoints (Task 13)
- Produces: URL Activity Report page, URL Categories admin page, navigation entries

- [ ] **Step 1: Create urlTrackingApi.ts**

Create `web/src/pm/urlTrackingApi.ts`:

```ts
import { authed } from '../fetchHelper';

export type UrlActivityEntry = {
  _id: string;
  userId: { _id: string; displayName: string; email: string } | string;
  url: string;
  title: string;
  category: 'productive' | 'neutral' | 'non-productive';
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
};

export type UrlSummary = {
  byCategory: Record<string, number>;
  topUrls: { url: string; category: string; totalMs: number }[];
  byUser: { userId: string; displayName: string; totalMs: number }[];
};

export type UrlCategoryRule = {
  _id: string;
  pattern: string;
  category: 'productive' | 'neutral' | 'non-productive';
  label: string;
};

export const getUrlActivities = (startDate: string, endDate: string) =>
  authed(`/url-tracking/activities?startDate=${startDate}&endDate=${endDate}`) as Promise<UrlActivityEntry[]>;

export const getUrlSummary = (startDate: string, endDate: string) =>
  authed(`/url-tracking/summary?startDate=${startDate}&endDate=${endDate}`) as Promise<UrlSummary>;

export const listUrlCategories = () =>
  authed('/url-tracking/categories') as Promise<UrlCategoryRule[]>;

export const createUrlCategory = (body: { pattern: string; category: string; label: string }) =>
  authed('/url-tracking/categories', 'POST', body) as Promise<UrlCategoryRule>;

export const updateUrlCategory = (id: string, body: Partial<UrlCategoryRule>) =>
  authed(`/url-tracking/categories/${id}`, 'PATCH', body) as Promise<UrlCategoryRule>;

export const deleteUrlCategory = (id: string) =>
  authed(`/url-tracking/categories/${id}`, 'DELETE');
```

- [ ] **Step 2: Create UrlTracking.tsx report page**

Create `web/src/pm/UrlTracking.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getUrlSummary, UrlSummary } from './urlTrackingApi';

function formatMs(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const CATEGORY_COLORS: Record<string, string> = {
  productive: 'status-done',
  neutral: 'status-active',
  'non-productive': 'status-archived',
};

export function UrlTracking() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<UrlSummary | null>(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    getUrlSummary(startDate, endDate).then(setSummary).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, [startDate, endDate]);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">URL Activity</h1>
          <p className="ts-sub">Productivity insights from tracked URLs</p>
        </div>
        <div className="ts-nav-left">
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </header>

      {error && <p className="ts-error">{error}</p>}

      {summary && (
        <>
          <div className="ts-tiles">
            {(['productive', 'neutral', 'non-productive'] as const).map((cat) => (
              <div key={cat} className={`ts-tile ${CATEGORY_COLORS[cat]}`}>
                <span className="ts-tile-label">{cat}</span>
                <span className="ts-tile-value">{formatMs(summary.byCategory[cat] || 0)}</span>
              </div>
            ))}
          </div>

          <div className="ts-card">
            <div className="card-title">Top URLs</div>
            <table className="ts-table">
              <thead><tr><th className="ts-task">URL</th><th className="col-left">Category</th><th className="col-left">Time</th></tr></thead>
              <tbody>
                {summary.topUrls.length === 0 && <tr><td colSpan={3} className="ts-empty">No data for this period.</td></tr>}
                {summary.topUrls.map((u, i) => (
                  <tr key={i}>
                    <td className="ts-task">{u.url}</td>
                    <td className="col-left">
                      <span className={`status-badge ${CATEGORY_COLORS[u.category] || ''}`}>
                        <span className="status-dot" aria-hidden="true" />{u.category}
                      </span>
                    </td>
                    <td className="col-left">{formatMs(u.totalMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {summary.byUser.length > 0 && (
            <div className="ts-card">
              <div className="card-title">By Employee</div>
              <table className="ts-table">
                <thead><tr><th className="ts-task">Employee</th><th className="col-left">Total Time</th></tr></thead>
                <tbody>
                  {summary.byUser.map((u) => (
                    <tr key={u.userId}>
                      <td className="ts-task">{u.displayName}</td>
                      <td className="col-left">{formatMs(u.totalMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create UrlCategories.tsx admin page**

Create `web/src/pm/UrlCategories.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { listUrlCategories, createUrlCategory, deleteUrlCategory, UrlCategoryRule } from './urlTrackingApi';

export function UrlCategories() {
  const [rules, setRules] = useState<UrlCategoryRule[]>([]);
  const [pattern, setPattern] = useState('');
  const [category, setCategory] = useState<'productive' | 'neutral' | 'non-productive'>('productive');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  function reload() { listUrlCategories().then(setRules).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!pattern.trim()) return;
    setError('');
    try {
      await createUrlCategory({ pattern: pattern.trim(), category, label: label.trim() });
      setPattern(''); setLabel(''); reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function remove(id: string) {
    setError('');
    try { await deleteUrlCategory(id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">URL Categories</h1>
          <p className="ts-sub">Define rules to auto-categorize tracked URLs</p>
        </div>
      </header>

      <div className="ts-card card-section">
        <div className="card-title">Add Rule</div>
        <div className="ts-nav-left" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input className="input" placeholder="Domain pattern (e.g. github.com)" value={pattern}
            onChange={(e) => setPattern(e.target.value)} />
          <select className="input pm-select" value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}>
            <option value="productive">Productive</option>
            <option value="neutral">Neutral</option>
            <option value="non-productive">Non-Productive</option>
          </select>
          <input className="input" placeholder="Label (optional)" value={label}
            onChange={(e) => setLabel(e.target.value)} />
          <button className="btn btn-auto btn-primary" onClick={add}>Add</button>
        </div>
      </div>

      {error && <p className="ts-error">{error}</p>}

      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Pattern</th><th className="col-left">Category</th><th className="col-left">Label</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {rules.length === 0 && <tr><td colSpan={4} className="ts-empty">No rules defined.</td></tr>}
            {rules.map((r) => (
              <tr key={r._id}>
                <td className="ts-task">{r.pattern}</td>
                <td className="col-left">{r.category}</td>
                <td className="col-left">{r.label || '—'}</td>
                <td className="col-left">
                  <button className="table-action danger" onClick={() => remove(r._id)}>Delete</button>
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

- [ ] **Step 4: Add navigation entries and AppShell views**

In `web/src/pm/nav.ts`, update the `NavKey` type:

```ts
export type NavKey = 'users' | 'skills' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'url-tracking' | 'url-categories';
```

In `navForRole`, add `url-tracking` to admin and pm nav arrays, and `url-categories` to admin's:

For admin, add before `timesheet`:
```ts
{ key: 'url-tracking', label: 'URL Activity' },
{ key: 'url-categories', label: 'URL Categories' },
```

For pm, add before `timesheet`:
```ts
{ key: 'url-tracking', label: 'URL Activity' },
```

For reporting_manager, add before `timesheet`:
```ts
{ key: 'url-tracking', label: 'URL Activity' },
```

In `web/src/AppShell.tsx`, import the new components:

```tsx
import { UrlTracking } from './pm/UrlTracking';
import { UrlCategories } from './pm/UrlCategories';
```

Add cases to the `viewFor` switch:

```tsx
case 'url-tracking': return <UrlTracking />;
case 'url-categories': return <UrlCategories />;
```

Add entries to `NAV_ICONS`:

```tsx
'url-tracking': <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />,
'url-categories': <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />,
```

- [ ] **Step 5: Test in browser**

1. Log in as Admin. Verify "URL Activity" and "URL Categories" appear in sidebar.
2. Create a few URL category rules on the URL Categories page.
3. Use curl to ingest some URL activities (from Task 13).
4. View the URL Activity page. Verify summary tiles and top URLs table populate.
5. Log in as PM. Verify "URL Activity" appears but "URL Categories" does not.

- [ ] **Step 6: Commit**

```bash
git add web/src/pm/UrlTracking.tsx web/src/pm/UrlCategories.tsx web/src/pm/urlTrackingApi.ts web/src/pm/nav.ts web/src/AppShell.tsx
git commit -m "feat: add URL tracking report and category management pages"
```

---

### Task 15: Utilization Report Frontend Page

**Files:**
- Create: `web/src/pm/Utilization.tsx`
- Create: `web/src/pm/utilizationApi.ts`
- Modify: `web/src/pm/nav.ts`
- Modify: `web/src/AppShell.tsx`

**Interfaces:**
- Consumes: `GET /reports/utilization` endpoint (Task 10)
- Produces: Utilization report page accessible to PM/Admin

- [ ] **Step 1: Create utilizationApi.ts**

Create `web/src/pm/utilizationApi.ts`:

```ts
import { authed } from '../fetchHelper';

export type EmployeeUtilization = {
  userId: string;
  displayName: string;
  email: string;
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  utilizationPct: number;
};

export type UtilizationReport = {
  startDate: string;
  endDate: string;
  employees: EmployeeUtilization[];
  summary: {
    totalMinutes: number;
    billableMinutes: number;
    nonBillableMinutes: number;
    utilizationPct: number;
  };
};

export const getUtilization = (startDate: string, endDate: string) =>
  authed(`/reports/utilization?startDate=${startDate}&endDate=${endDate}`) as Promise<UtilizationReport>;
```

- [ ] **Step 2: Create Utilization.tsx page**

Create `web/src/pm/Utilization.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getUtilization, UtilizationReport } from './utilizationApi';
import { formatMinutes } from '../timesheet/time';

export function Utilization() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<UtilizationReport | null>(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    getUtilization(startDate, endDate).then(setReport).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, [startDate, endDate]);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Utilization</h1>
          <p className="ts-sub">Billable hours and employee utilization</p>
        </div>
        <div className="ts-nav-left">
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </header>

      {error && <p className="ts-error">{error}</p>}

      {report && (
        <>
          <div className="ts-tiles">
            <div className="ts-tile ts-tile-accent">
              <span className="ts-tile-label">Utilization</span>
              <span className="ts-tile-value">{report.summary.utilizationPct}%</span>
            </div>
            <div className="ts-tile stat-done">
              <span className="ts-tile-label">Billable</span>
              <span className="ts-tile-value">{formatMinutes(report.summary.billableMinutes)}</span>
            </div>
            <div className="ts-tile stat-logged">
              <span className="ts-tile-label">Non-Billable</span>
              <span className="ts-tile-value">{formatMinutes(report.summary.nonBillableMinutes)}</span>
            </div>
            <div className="ts-tile stat-tasks">
              <span className="ts-tile-label">Total</span>
              <span className="ts-tile-value">{formatMinutes(report.summary.totalMinutes)}</span>
            </div>
          </div>

          <div className="ts-card">
            <table className="ts-table">
              <thead>
                <tr>
                  <th className="ts-task">Employee</th>
                  <th className="col-left">Billable</th>
                  <th className="col-left">Non-Billable</th>
                  <th className="col-left">Total</th>
                  <th className="col-left">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {report.employees.length === 0 && <tr><td colSpan={5} className="ts-empty">No data for this period.</td></tr>}
                {report.employees.map((e) => (
                  <tr key={e.userId}>
                    <td className="ts-task">{e.displayName}</td>
                    <td className="col-left">{formatMinutes(e.billableMinutes)}</td>
                    <td className="col-left">{formatMinutes(e.nonBillableMinutes)}</td>
                    <td className="col-left">{formatMinutes(e.totalMinutes)}</td>
                    <td className="col-left">
                      <div className="prog">
                        <div className="prog-track">
                          <div className={`prog-fill ${e.utilizationPct >= 80 ? 'done' : e.utilizationPct > 0 ? 'mid' : 'low'}`}
                            style={{ width: `${e.utilizationPct}%` }} />
                        </div>
                        <span className="prog-pct">{e.utilizationPct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add navigation and AppShell wiring**

In `web/src/pm/nav.ts`, add `'utilization'` to the `NavKey` type.

Add to admin nav (before `url-tracking`):
```ts
{ key: 'utilization', label: 'Utilization' },
```

Add to pm nav (before `url-tracking`):
```ts
{ key: 'utilization', label: 'Utilization' },
```

In `web/src/AppShell.tsx`, import and add the case:

```tsx
import { Utilization } from './pm/Utilization';
// in viewFor:
case 'utilization': return <Utilization />;
```

Add to `NAV_ICONS`:

```tsx
utilization: <path d="M18 20V10M12 20V4M6 20v-6" />,
```

- [ ] **Step 4: Test in browser**

1. Log in as Admin/PM.
2. Click "Utilization" in sidebar.
3. Verify date range filter works.
4. If billable timesheet data exists, verify employee rows show correct billable/non-billable/utilization.

- [ ] **Step 5: Commit**

```bash
git add web/src/pm/Utilization.tsx web/src/pm/utilizationApi.ts web/src/pm/nav.ts web/src/AppShell.tsx
git commit -m "feat: add utilization report page for PM/Admin"
```
