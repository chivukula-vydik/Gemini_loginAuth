# Multi-Role Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to have multiple roles simultaneously by changing `User.role` (string) to `User.roles` (string array), updating the JWT token, middleware, and all role checks across backend and frontend.

**Architecture:** Change the User model schema from `role: String` to `roles: [String]`. Update the JWT payload from `role` to `roles`. Change `requireRole` middleware to check array intersection. Update every `req.user.role === 'x'` to `req.user.roles.includes('x')`. Frontend merges nav items from all roles. Admin UI uses checkboxes instead of a dropdown.

**Tech Stack:** Express.js, Mongoose, React 19, TypeScript

## Global Constraints

- Backend route pattern: `export function createXRouter()` factory, mounted in `auth-api/src/app.js`.
- Frontend API pattern: `authed(path, method?, body?)` from `web/src/fetchHelper.ts`.
- Valid roles: `'admin'`, `'pm'`, `'employee'`, `'reporting_manager'`.
- Backwards compat: all read paths use `user.roles || [user.role || 'employee']` fallback for old docs.
- Do NOT touch `auth-api/src/models/Timesheet.js` — pre-existing uncommitted change.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `auth-api/src/models/User.js` | Modify | Schema: `role` → `roles` array |
| `auth-api/src/services/tokens.js` | Modify | JWT payload: `role` → `roles` |
| `auth-api/src/services/authz.js` | Modify | `resolveRole` → `resolveRoles`, update `canViewProject`/`canEditProject` |
| `auth-api/src/middleware/requireRole.js` | Modify | Check `roles` array intersection |
| `auth-api/src/routes/auth.js` | Modify | Use `resolveRoles`, write `roles` |
| `auth-api/src/routes/admin.js` | Modify | `PATCH roles` endpoint, admin checks, RM validation |
| `auth-api/src/routes/dashboard.js` | Modify | Team role check uses `roles` |
| `auth-api/src/routes/manager.js` | No change | Already guarded by requireRole |
| `auth-api/src/routes/attendance.js` | Modify | RM scoping uses `roles` |
| `auth-api/src/routes/leave.js` | Modify | RM/PM filter uses `roles` |
| `auth-api/src/routes/timesheets.js` | Modify | RM scoping, privileged check uses `roles` |
| `auth-api/src/routes/editRequests.js` | Modify | RM scoping uses `roles` |
| `auth-api/src/routes/projects.js` | Modify | Admin/PM checks use `roles` |
| `auth-api/src/routes/users.js` | Modify | Privileged check uses `roles` |
| `web/src/authContext.tsx` | Modify | `User.role` → `User.roles` |
| `web/src/pm/nav.ts` | Modify | `navForRole` → `navForRoles` |
| `web/src/pm/pmApi.ts` | Modify | `UserRow.role` → `UserRow.roles`, `setUserRole` → `setUserRoles` |
| `web/src/pm/AdminUsers.tsx` | Modify | Checkbox group instead of dropdown |
| `web/src/AppShell.tsx` | Modify | Use `navForRoles`, display roles |
| `web/src/dashboard/HomePage.tsx` | Modify | `isTeam` check uses `roles` |
| `web/src/dashboard/RMDashboard.tsx` | No change | Accessed via route |
| `web/src/attendance/AttendancePage.tsx` | Modify | `isTeamLead` check uses `roles` |
| `web/src/timesheet/TimesheetPage.tsx` | Modify | `canOverrideBillable` uses `roles` |

---

### Task 1: User Model + Auth Pipeline (model, tokens, authz, requireRole, auth route)

**Files:**
- Modify: `auth-api/src/models/User.js:33`
- Modify: `auth-api/src/services/tokens.js:14`
- Modify: `auth-api/src/services/authz.js:1-21`
- Modify: `auth-api/src/middleware/requireRole.js:1-7`
- Modify: `auth-api/src/routes/auth.js:11,25-29`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: `User.roles` array field; JWT with `roles: string[]`; `requireRole` checks array intersection; `resolveRoles(user, env): string[]`; `canViewProject(user, project)` and `canEditProject(user, project)` check `user.roles`

- [ ] **Step 1: Update User model schema**

In `auth-api/src/models/User.js`, replace line 33:

```js
  role: { type: String, enum: ['admin', 'pm', 'employee', 'reporting_manager'], default: 'employee' },
```

With:

```js
  roles: { type: [String], enum: ['admin', 'pm', 'employee', 'reporting_manager'], default: ['employee'] },
```

- [ ] **Step 2: Update tokens.js**

In `auth-api/src/services/tokens.js`, replace line 14:

```js
    { sub: String(user._id), email: user.email, name: user.displayName, role: user.role || 'employee' },
```

With:

```js
    { sub: String(user._id), email: user.email, name: user.displayName, roles: user.roles || [user.role || 'employee'] },
```

- [ ] **Step 3: Update authz.js**

Replace the entire contents of `auth-api/src/services/authz.js` with:

```js
function userId(user) {
  return String(user.sub ?? user.id ?? user._id ?? '');
}

function userRoles(user) {
  return user.roles || [user.role || 'employee'];
}

export function resolveRoles(user, env = process.env) {
  const adminEmail = String(env.ADMIN_EMAIL || '').toLowerCase().trim();
  const roles = [...(user.roles || [user.role || 'employee'])];
  if (adminEmail && String(user.email || '').toLowerCase().trim() === adminEmail && !roles.includes('admin')) {
    roles.unshift('admin');
  }
  return roles;
}

export function canViewProject(user, project) {
  const roles = userRoles(user);
  if (roles.includes('admin')) return true;
  const uid = userId(user);
  if (String(project.ownerPm) === uid) return true;
  return (project.members || []).some((m) => String(m) === uid);
}

export function canEditProject(user, project) {
  const roles = userRoles(user);
  if (roles.includes('admin')) return true;
  return roles.includes('pm') && String(project.ownerPm) === userId(user);
}

export function canCreateTask(user, project) {
  return canEditProject(user, project);
}

export function canLogProgress(user, task) {
  const uid = userId(user);
  return Array.isArray(task.assignees) && task.assignees.some((a) => String(a.user) === uid);
}
```

- [ ] **Step 4: Update requireRole middleware**

Replace the entire contents of `auth-api/src/middleware/requireRole.js` with:

```js
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'missing token' });
    const roles = req.user.roles || [req.user.role || 'employee'];
    if (!roles.some((r) => allowed.includes(r))) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
```

- [ ] **Step 5: Update auth.js login flow**

In `auth-api/src/routes/auth.js`, change line 11 from:

```js
import { resolveRole } from '../services/authz.js';
```

To:

```js
import { resolveRoles } from '../services/authz.js';
```

Replace the `completeLogin` function (lines 24-33) with:

```js
export async function completeLogin(res, user) {
  const desiredRoles = resolveRoles(user, process.env);
  const currentRoles = user.roles || [user.role || 'employee'];
  if (JSON.stringify(desiredRoles.sort()) !== JSON.stringify(currentRoles.sort())) {
    user.roles = desiredRoles;
    user.role = undefined;
    await user.save();
  }
  const refresh = await issueRefreshToken(user);
  res.cookie(COOKIE_NAME, refresh, cookieOptions());
  return signAccessToken(user);
}
```

- [ ] **Step 6: Verify backend starts**

Run: `cd auth-api && node -e "import('./src/app.js').then(() => console.log('OK'))"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add auth-api/src/models/User.js auth-api/src/services/tokens.js auth-api/src/services/authz.js auth-api/src/middleware/requireRole.js auth-api/src/routes/auth.js
git commit -m "feat: change User.role to User.roles array + update auth pipeline"
```

---

### Task 2: Backend Route Updates (all role checks)

**Files:**
- Modify: `auth-api/src/routes/admin.js:14,25-26,29-36,45-49,53,63,83-85`
- Modify: `auth-api/src/routes/dashboard.js:55,145,149,161`
- Modify: `auth-api/src/routes/attendance.js:315,317,393,413`
- Modify: `auth-api/src/routes/leave.js:84,86,106`
- Modify: `auth-api/src/routes/timesheets.js:51,167`
- Modify: `auth-api/src/routes/editRequests.js:15`
- Modify: `auth-api/src/routes/projects.js:53,54,140,166`
- Modify: `auth-api/src/routes/users.js:54,69`

**Interfaces:**
- Consumes: `User.roles` array from Task 1; `req.user.roles` from JWT (Task 1)
- Produces: All backend routes correctly check `roles` array instead of single `role` string

- [ ] **Step 1: Update admin.js**

In `auth-api/src/routes/admin.js`:

Replace line 25 (`router.get('/users'`):

```js
  router.get('/users', asyncHandler(async (req, res) => {
    const users = await User.find().select('email displayName roles role active reestimationCount reportingManagerId').sort('email');
    res.json(users.map((u) => ({ ...u.toObject(), roles: u.roles || [u.role || 'employee'] })));
  }));
```

Replace the role update endpoint (lines 29-36) with:

```js
  router.patch('/users/:id/roles', asyncHandler(async (req, res) => {
    const { roles } = req.body || {};
    if (!Array.isArray(roles) || roles.length === 0) return res.status(400).json({ error: 'roles must be a non-empty array' });
    if (roles.some((r) => !ROLES.includes(r))) return res.status(400).json({ error: 'invalid role in array' });
    const unique = [...new Set(roles)];
    const user = await User.findByIdAndUpdate(req.params.id, { roles: unique, $unset: { role: 1 } }, { new: true })
      .select('email displayName roles active');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  }));
```

Replace line 45 (`target.role === 'admin'` in deactivate):

```js
    if (!active && (target.roles || [target.role]).includes('admin')) {
```

Replace line 47-49 (count other admins in deactivate):

```js
      const otherActiveAdmins = await User.countDocuments({
        _id: { $ne: target._id }, roles: 'admin', active: { $ne: false },
      });
```

Replace line 53 (response in deactivate):

```js
    res.json({ _id: target._id, email: target.email, displayName: target.displayName, roles: target.roles || [target.role || 'employee'], active: target.active });
```

Replace line 63 (RM validation):

```js
      if (!rm || !(rm.roles || [rm.role]).includes('reporting_manager')) {
```

Replace line 71 (response in RM assignment):

```js
    ).select('email displayName roles role active reportingManagerId');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json({ ...user.toObject(), roles: user.roles || [user.role || 'employee'] });
```

Replace lines 83-85 (admin check in delete):

```js
    if ((target.roles || [target.role]).includes('admin')) {
      const otherAdmins = await User.countDocuments({ _id: { $ne: target._id }, roles: 'admin' });
```

- [ ] **Step 2: Update dashboard.js**

In `auth-api/src/routes/dashboard.js`:

Replace line 55:

```js
    const roles = req.user.roles || [req.user.role || 'employee'];
```

Replace line 145 (`if (TEAM_ROLES.includes(role))`):

```js
    if (roles.some((r) => TEAM_ROLES.includes(r))) {
```

Replace lines 148-150 (leave filter):

```js
        if (roles.includes('reporting_manager')) leaveFilter.assignedApprover = userId;
        else if (roles.includes('pm')) leaveFilter.assignedApprover = null;
```

Replace lines 161-163 (timesheet filter):

```js
        if (roles.includes('reporting_manager')) {
```

- [ ] **Step 3: Update attendance.js**

In `auth-api/src/routes/attendance.js`:

Replace line 315 (`if (req.user.role === 'admin')`):

```js
    const roles = req.user.roles || [req.user.role || 'employee'];
    if (roles.includes('admin')) {
```

Replace line 317 (`} else if (req.user.role === 'reporting_manager')`):

```js
    } else if (roles.includes('reporting_manager')) {
```

Replace line 393 (`if (req.user.role === 'reporting_manager')` in regularise pending):

```js
    if ((req.user.roles || [req.user.role]).includes('reporting_manager')) {
```

Replace line 413 (`if (req.user.role === 'reporting_manager')` in regularise decide):

```js
    if ((req.user.roles || [req.user.role]).includes('reporting_manager')) {
```

- [ ] **Step 4: Update leave.js**

In `auth-api/src/routes/leave.js`:

Replace lines 83-86:

```js
    const roles = req.user.roles || [req.user.role || 'employee'];
    if (roles.includes('reporting_manager')) {
      filter.assignedApprover = req.user.sub;
    } else if (roles.includes('pm')) {
```

Replace line 106:

```js
    if ((req.user.roles || [req.user.role]).includes('reporting_manager') && String(doc.assignedApprover) !== req.user.sub) {
```

- [ ] **Step 5: Update timesheets.js**

In `auth-api/src/routes/timesheets.js`:

Replace line 51:

```js
    if ((req.user.roles || [req.user.role]).includes('reporting_manager')) {
```

Replace line 167:

```js
    if (String(meta.userId) !== String(req.user.sub) && !(req.user.roles || [req.user.role]).some((r) => ['pm', 'admin', 'reporting_manager'].includes(r))) {
```

- [ ] **Step 6: Update editRequests.js**

In `auth-api/src/routes/editRequests.js`:

Replace line 15:

```js
    if ((req.user.roles || [req.user.role]).includes('reporting_manager')) {
```

- [ ] **Step 7: Update projects.js**

In `auth-api/src/routes/projects.js`:

Replace lines 53-54:

```js
    const roles = req.user.roles || [req.user.role || 'employee'];
    if (roles.includes('admin')) query = {};
    else if (roles.includes('pm')) query = { ownerPm: req.user.sub };
```

Replace line 140:

```js
        _id: uid, displayName: u.displayName, email: u.email, roles: u.roles || [u.role || 'employee'],
```

Replace line 166:

```js
      if (!owner || !(owner.roles || [owner.role]).some((r) => ['pm', 'admin'].includes(r))) {
```

- [ ] **Step 8: Update users.js**

In `auth-api/src/routes/users.js`:

Replace line 54:

```js
        _id: String(u._id), displayName: u.displayName, email: u.email, roles: u.roles || [u.role || 'employee'],
```

Replace line 69:

```js
    const isPrivileged = (req.user.roles || [req.user.role]).some((r) => ['pm', 'admin'].includes(r));
```

- [ ] **Step 9: Verify backend starts**

Run: `cd auth-api && node -e "import('./src/app.js').then(() => console.log('OK'))"`
Expected: `OK`

- [ ] **Step 10: Commit**

```bash
git add auth-api/src/routes/admin.js auth-api/src/routes/dashboard.js auth-api/src/routes/attendance.js auth-api/src/routes/leave.js auth-api/src/routes/timesheets.js auth-api/src/routes/editRequests.js auth-api/src/routes/projects.js auth-api/src/routes/users.js
git commit -m "feat: update all backend routes to use roles array"
```

---

### Task 3: Frontend — authContext, nav, AppShell, page components

**Files:**
- Modify: `web/src/authContext.tsx:8`
- Modify: `web/src/pm/nav.ts:1-53`
- Modify: `web/src/pm/pmApi.ts:6,82`
- Modify: `web/src/AppShell.tsx:6,48,74`
- Modify: `web/src/dashboard/HomePage.tsx:44`
- Modify: `web/src/attendance/AttendancePage.tsx:154`
- Modify: `web/src/timesheet/TimesheetPage.tsx:28`

**Interfaces:**
- Consumes: Backend now returns `roles: string[]` on user objects; JWT carries `roles`
- Produces: Frontend `User` type has `roles` array; `navForRoles(roles)` merges nav items; all role checks use `.roles.includes()` or `.roles.some()`

- [ ] **Step 1: Update authContext.tsx**

In `web/src/authContext.tsx`, replace line 8:

```ts
  role: 'admin' | 'pm' | 'employee' | 'reporting_manager';
```

With:

```ts
  roles: ('admin' | 'pm' | 'employee' | 'reporting_manager')[];
```

- [ ] **Step 2: Update nav.ts**

Replace the entire contents of `web/src/pm/nav.ts` with:

```ts
export type Role = 'admin' | 'pm' | 'employee' | 'reporting_manager';
export type NavKey = 'home' | 'users' | 'skills' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'utilization' | 'my-team';
export type NavItem = { key: NavKey; label: string; path: string };

const ALL_NAV_KEYS: NavKey[] = ['home', 'users', 'skills', 'company-fit', 'projects', 'requests', 'marketplace', 'my-tasks', 'my-skills', 'timesheet', 'attendance', 'utilization', 'my-team'];

export function pathForKey(key: NavKey): string {
  return key === 'home' ? '/' : `/${key}`;
}

export function keyForPath(pathname: string): NavKey {
  if (pathname === '/') return 'home';
  const seg = pathname.slice(1);
  return ALL_NAV_KEYS.includes(seg as NavKey) ? (seg as NavKey) : 'home';
}

function navForRole(role: Role): NavItem[] {
  const home: NavItem = { key: 'home', label: 'Home', path: '/' };
  const timesheet: NavItem = { key: 'timesheet', label: 'Timesheet', path: '/timesheet' };
  const attendance: NavItem = { key: 'attendance', label: 'Attendance', path: '/attendance' };
  if (role === 'admin') {
    return [
      home,
      { key: 'users', label: 'Users', path: '/users' },
      { key: 'skills', label: 'Skills', path: '/skills' },
      { key: 'company-fit', label: 'Company fit', path: '/company-fit' },
      { key: 'projects', label: 'Projects', path: '/projects' },
      { key: 'requests', label: 'Requests', path: '/requests' },
      { key: 'utilization', label: 'Utilization', path: '/utilization' },
      timesheet,
      attendance,
    ];
  }
  if (role === 'pm') {
    return [home, { key: 'projects', label: 'Projects', path: '/projects' }, { key: 'requests', label: 'Requests', path: '/requests' }, { key: 'utilization', label: 'Utilization', path: '/utilization' }, timesheet, attendance];
  }
  if (role === 'reporting_manager') {
    return [
      home,
      { key: 'my-team', label: 'My Team', path: '/my-team' },
      { key: 'requests', label: 'Requests', path: '/requests' },
      timesheet,
      attendance,
    ];
  }
  return [
    home,
    { key: 'my-tasks', label: 'My Tasks', path: '/my-tasks' },
    { key: 'my-skills', label: 'My Skills', path: '/my-skills' },
    { key: 'marketplace', label: 'Marketplace', path: '/marketplace' },
    timesheet,
    attendance,
  ];
}

export function navForRoles(roles: Role[]): NavItem[] {
  const seen = new Set<NavKey>();
  const result: NavItem[] = [];
  const priority: Role[] = ['admin', 'pm', 'reporting_manager', 'employee'];
  const ordered = priority.filter((r) => roles.includes(r));
  if (ordered.length === 0) ordered.push('employee');
  for (const role of ordered) {
    for (const item of navForRole(role)) {
      if (!seen.has(item.key)) {
        seen.add(item.key);
        result.push(item);
      }
    }
  }
  return result;
}
```

- [ ] **Step 3: Update pmApi.ts**

In `web/src/pm/pmApi.ts`, replace line 6:

```ts
export type UserRow = { _id: string; email: string; displayName: string; role: Role; active?: boolean; reestimationCount?: number; reportingManagerId?: string | null };
```

With:

```ts
export type UserRow = { _id: string; email: string; displayName: string; roles: Role[]; active?: boolean; reestimationCount?: number; reportingManagerId?: string | null };
```

Replace line 82:

```ts
export const setUserRole = (id: string, role: Role) => authed(`/admin/users/${id}/role`, 'PATCH', { role });
```

With:

```ts
export const setUserRoles = (id: string, roles: Role[]) => authed(`/admin/users/${id}/roles`, 'PATCH', { roles });
```

- [ ] **Step 4: Update AppShell.tsx**

In `web/src/AppShell.tsx`:

Replace line 6:

```tsx
import { navForRole, keyForPath, NavKey } from './pm/nav';
```

With:

```tsx
import { navForRoles, keyForPath, NavKey } from './pm/nav';
```

Replace line 48:

```tsx
  const items = navForRole(user?.role ?? 'employee');
```

With:

```tsx
  const items = navForRoles(user?.roles ?? ['employee']);
```

Replace line 74:

```tsx
              {user?.role && <div className="shell-user-role">{user.role}</div>}
```

With:

```tsx
              {user?.roles && <div className="shell-user-role">{user.roles.join(', ')}</div>}
```

- [ ] **Step 5: Update HomePage.tsx**

In `web/src/dashboard/HomePage.tsx`, replace line 44:

```tsx
  const isTeam = user?.role === 'admin' || user?.role === 'pm' || user?.role === 'reporting_manager';
```

With:

```tsx
  const isTeam = user?.roles?.some((r) => ['admin', 'pm', 'reporting_manager'].includes(r)) ?? false;
```

- [ ] **Step 6: Update AttendancePage.tsx**

In `web/src/attendance/AttendancePage.tsx`, replace line 154:

```tsx
  const isTeamLead = user?.role === 'pm' || user?.role === 'admin';
```

With:

```tsx
  const isTeamLead = user?.roles?.some((r) => ['pm', 'admin'].includes(r)) ?? false;
```

- [ ] **Step 7: Update TimesheetPage.tsx**

In `web/src/timesheet/TimesheetPage.tsx`, replace line 28:

```tsx
  const canOverrideBillable = user?.role === 'admin' || user?.role === 'pm';
```

With:

```tsx
  const canOverrideBillable = user?.roles?.some((r) => ['admin', 'pm'].includes(r)) ?? false;
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: Errors in `AdminUsers.tsx` only (it still references `u.role` and `setUserRole`). Task 4 fixes these.

- [ ] **Step 9: Commit**

```bash
git add web/src/authContext.tsx web/src/pm/nav.ts web/src/pm/pmApi.ts web/src/AppShell.tsx web/src/dashboard/HomePage.tsx web/src/attendance/AttendancePage.tsx web/src/timesheet/TimesheetPage.tsx
git commit -m "feat: update frontend to use roles array"
```

---

### Task 4: AdminUsers — Multi-Role Checkbox UI

**Files:**
- Modify: `web/src/pm/AdminUsers.tsx`

**Interfaces:**
- Consumes: `UserRow` with `roles: Role[]` from `pmApi.ts` (Task 3); `setUserRoles(id, roles)` from `pmApi.ts` (Task 3)
- Produces: Admin Users page with checkbox group for role selection instead of single dropdown

- [ ] **Step 1: Replace the entire contents of `web/src/pm/AdminUsers.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { listUsers, setUserRoles, setUserActive, deleteUser, setReportingManager, UserRow } from './pmApi';
import { useAuth } from '../authContext';
import { personName, initials } from './personName';
import type { Role } from './nav';

const ROLES: Role[] = ['admin', 'pm', 'employee', 'reporting_manager'];
const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', pm: 'PM', employee: 'Employee', reporting_manager: 'RM' };

export function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { listUsers().then(setUsers).catch((e) => setError(e.message)); }, []);

  async function toggleRole(id: string, currentRoles: Role[], role: Role) {
    setError('');
    const has = currentRoles.includes(role);
    const next = has ? currentRoles.filter((r) => r !== role) : [...currentRoles, role];
    if (next.length === 0) return;
    try {
      const updated = await setUserRoles(id, next);
      setUsers((us) => us.map((u) => (u._id === id ? { ...u, ...updated } : u)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleActive(u: UserRow) {
    setError('');
    try {
      const updated = await setUserActive(u._id, u.active === false);
      setUsers((us) => us.map((x) => (x._id === u._id ? { ...x, ...updated } : x)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(u: UserRow) {
    if (!window.confirm(`Permanently delete ${u.email}? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteUser(u._id);
      setUsers((us) => us.filter((x) => x._id !== u._id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function assignRM(userId: string, rmId: string | null) {
    setError('');
    try {
      await setReportingManager(userId, rmId);
      setUsers((us) => us.map((u) => (u._id === userId ? { ...u, reportingManagerId: rmId } : u)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const total = users.length;
  const activeCount = users.filter((u) => u.active !== false).length;
  const admins = users.filter((u) => u.roles.includes('admin')).length;
  const pms = users.filter((u) => u.roles.includes('pm')).length;
  const employees = users.filter((u) => u.roles.includes('employee')).length;
  const rms = users.filter((u) => u.roles.includes('reporting_manager')).length;

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Users</h1>
          <p className="ts-sub">{users.length} {users.length === 1 ? 'member' : 'members'}</p>
        </div>
      </header>

      <div className="ts-tiles">
        <div className="ts-tile ts-tile-accent">
          <span className="ts-tile-label">Total members</span>
          <span className="ts-tile-value">{total}</span>
          <span className="ts-tile-foot">{activeCount} active · {total - activeCount} inactive</span>
        </div>
        <div className="ts-tile stat-tasks">
          <span className="ts-tile-label">Admins</span>
          <span className="ts-tile-value">{admins}</span>
        </div>
        <div className="ts-tile stat-done">
          <span className="ts-tile-label">Project managers</span>
          <span className="ts-tile-value">{pms}</span>
        </div>
        <div className="ts-tile stat-logged">
          <span className="ts-tile-label">Employees</span>
          <span className="ts-tile-value">{employees}</span>
        </div>
        <div className="ts-tile stat-est">
          <span className="ts-tile-label">Reporting Managers</span>
          <span className="ts-tile-value">{rms}</span>
        </div>
      </div>

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-task">User</th>
              <th className="col-left">Roles</th>
              <th className="col-left">Reporting Manager</th>
              <th className="col-left">Status</th>
              <th className="col-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && <tr><td colSpan={5} className="ts-empty">No users found.</td></tr>}
            {users.map((u) => {
              const inactive = u.active === false;
              const isSelf = u.email === me?.email;
              return (
                <tr key={u._id} className={inactive ? 'row-inactive' : undefined}>
                  <td className="ts-task">
                    <span className="person-pill">
                      <span className="person-avatar">{initials(u)}</span>
                      <span className="user-id">
                        <span className="user-id-name">
                          {personName(u)}
                          {isSelf && <span className="self-tag">You</span>}
                        </span>
                        <span className="user-id-email">{u.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="col-left">
                    <div className="role-checkboxes">
                      {ROLES.map((r) => (
                        <label key={r} className="role-check-label">
                          <input type="checkbox" checked={u.roles.includes(r)}
                            onChange={() => toggleRole(u._id, u.roles, r)} />
                          {ROLE_LABELS[r]}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="col-left">
                    {u.roles.includes('employee') ? (
                      <select className="input pm-select" value={u.reportingManagerId || ''}
                        onChange={(e) => assignRM(u._id, e.target.value || null)}>
                        <option value="">None</option>
                        {users.filter((x) => x.roles.includes('reporting_manager') && x.active !== false).map((rm) => (
                          <option key={rm._id} value={rm._id}>{personName(rm)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="ts-sub">—</span>
                    )}
                  </td>
                  <td className="col-left">
                    <span className={`status-badge ${inactive ? 'status-archived' : 'status-done'}`}>
                      <span className="status-dot" aria-hidden="true" />
                      {inactive ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td className="col-left">
                    {!isSelf && (
                      <div className="row-actions">
                        <button className="table-action" onClick={() => toggleActive(u)}>
                          {inactive ? 'Activate' : 'Deactivate'}
                        </button>
                        <button className="table-action danger" onClick={() => remove(u)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for role checkboxes**

Append to `web/src/styles.css`:

```css
/* ── Role checkboxes ── */
.role-checkboxes { display: flex; gap: 8px; flex-wrap: wrap; }
.role-check-label { display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; white-space: nowrap; }
.role-check-label input[type="checkbox"] { margin: 0; cursor: pointer; }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web/src/pm/AdminUsers.tsx web/src/styles.css
git commit -m "feat: update AdminUsers to multi-role checkbox UI"
```
